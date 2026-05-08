import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

export interface BridgeOptions {
  command: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  requestTimeoutMs?: number;
  logger?: { info: (msg: string, meta?: unknown) => void; error: (msg: string, meta?: unknown) => void };
}

export class StdioBridge {
  private child: ChildProcessWithoutNullStreams;
  private pending = new Map<string, PendingRequest>();
  private buffer = '';
  private readonly timeoutMs: number;
  private readonly logger: BridgeOptions['logger'];

  constructor(opts: BridgeOptions) {
    this.timeoutMs = opts.requestTimeoutMs ?? 30_000;
    this.logger = opts.logger;
    this.child = spawn(opts.command, opts.args ?? [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...opts.env },
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => this.handleStdout(chunk));
    this.child.stderr.on('data', (chunk: string) => this.logger?.info('upstream-stderr', { chunk: chunk.trim() }));
    this.child.on('exit', (code) => {
      this.logger?.error('upstream-exit', { code });
      for (const [, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`upstream exited with code ${code}`));
      }
      this.pending.clear();
    });
  }

  private handleStdout(chunk: string): void {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as { id?: string; result?: unknown; error?: unknown };
        if (msg.id !== undefined) {
          const pending = this.pending.get(String(msg.id));
          if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(String(msg.id));
            if ('error' in msg && msg.error) pending.reject(new Error(JSON.stringify(msg.error)));
            else pending.resolve(msg.result);
          }
        }
      } catch (err: unknown) {
        this.logger?.error('bridge-parse-error', { line, err: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  call(method: string, params?: unknown): Promise<unknown> {
    const id = randomUUID();
    const request = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`upstream timeout after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.child.stdin.write(`${JSON.stringify(request)}\n`);
      } catch (err: unknown) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  shutdown(): void {
    this.child.kill('SIGTERM');
  }
}
