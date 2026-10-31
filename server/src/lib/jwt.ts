import jwt from 'jsonwebtoken';

import type { UserRole } from '@gym-saas/shared';

import { env } from '../config/env.js';

export interface AccessTokenPayload {
  /** User id (subject). */
  sub: string;
  role: UserRole;
  /** Gym the user belongs to; null for platform-level SUPER_ADMIN. */
  gymId: string | null;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    issuer: 'gym-saas',
  });
}

/** Returns the verified payload, or null when the token is invalid/expired. */
export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { issuer: 'gym-saas' });
    if (typeof decoded === 'string') return null;
    const { sub, role, gymId } = decoded as jwt.JwtPayload & Partial<AccessTokenPayload>;
    if (typeof sub !== 'string' || typeof role !== 'string') return null;
    if (gymId !== null && typeof gymId !== 'string') return null;
    return { sub, role, gymId: gymId ?? null };
  } catch {
    return null;
  }
}

/** Cookie lifetime in ms, derived from JWT_EXPIRES_IN (e.g. "1d", "12h"). */
export function cookieMaxAgeMs(): number {
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(env.JWT_EXPIRES_IN.trim());
  if (!match) return 24 * 60 * 60 * 1000;
  const value = Number(match[1]);
  const unit = match[2];
  const factor = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return value * factor;
}
