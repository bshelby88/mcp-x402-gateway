import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Env } from './config.js';

export interface LicenseClaims {
  sub: string;
  tier: 'pro' | 'business' | 'enterprise';
  routes?: string[];
  exp: number;
  iss: string;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function unb64url(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

export function issueLicense(env: Env, claims: Omit<LicenseClaims, 'iss'>): string {
  const payload = JSON.stringify({ ...claims, iss: env.LICENSE_ISSUER });
  const encoded = b64url(payload);
  const sig = createHmac('sha256', env.LICENSE_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyLicense(env: Env, token: string): LicenseClaims | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, providedSig] = parts as [string, string];
  const expectedSig = createHmac('sha256', env.LICENSE_SECRET).update(encoded).digest('base64url');
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const claims = JSON.parse(unb64url(encoded).toString('utf8')) as LicenseClaims;
  if (claims.iss !== env.LICENSE_ISSUER) return null;
  if (claims.exp < Math.floor(Date.now() / 1000)) return null;
  return claims;
}

export function licenseCoversRoute(claims: LicenseClaims, route: string): boolean {
  if (!claims.routes || claims.routes.length === 0) return true;
  return claims.routes.includes(route) || claims.routes.includes('*');
}
