import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: string,
  keylen: number
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SCHEME = 'scrypt';

/**
 * Hash a password with scrypt (Node built-in, no native dependencies).
 * Format: `scrypt:<salt-hex>:<hash-hex>` — self-describing so parameters can
 * be upgraded later without breaking existing hashes.
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(plain, salt, KEY_LENGTH);
  return `${SCHEME}:${salt}:${derived.toString('hex')}`;
}

/** Constant-time password verification. Returns false on malformed hashes. */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split(':');
  if (scheme !== SCHEME || !salt || !hash) return false;

  const derived = await scrypt(plain, salt, KEY_LENGTH);
  const expected = Buffer.from(hash, 'hex');
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}

/**
 * Hash used when an email does not exist, so login attempts take the same
 * time whether or not the account is real (prevents user enumeration).
 */
let dummyHashPromise: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(randomBytes(24).toString('hex'));
  return dummyHashPromise;
}
