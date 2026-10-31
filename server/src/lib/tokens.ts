import { createHash, randomBytes } from 'node:crypto';

/** Generate a URL-safe one-time token (256 bits of entropy). */
export function generateRawToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Hash a token for storage. Only the hash is persisted; the raw token is
 * returned to the caller exactly once and never written to disk or logs.
 */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
