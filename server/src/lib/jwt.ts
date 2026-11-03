import jsonwebtoken, { type JwtPayload, type SignOptions } from 'jsonwebtoken'
import { env } from '../config/env.js'

const ISSUER = 'gym-saas'

export function signAccessToken(payload: Record<string, unknown>): string {
  return jsonwebtoken.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    issuer: ISSUER,
  })
}

/** Returns the verified payload, or null when the token is invalid/expired. */
export function verifyAccessToken(token: string): { sub: string; role: string; gymId: string | null } | null {
  try {
    const decoded = jsonwebtoken.verify(token, env.JWT_SECRET, { issuer: ISSUER })
    if (typeof decoded === 'string') return null

    const { sub, role, gymId } = decoded as JwtPayload
    if (typeof sub !== 'string' || typeof role !== 'string') return null
    if (gymId !== null && typeof gymId !== 'string') return null

    return { sub, role, gymId: gymId ?? null }
  } catch {
    return null
  }
}

/** Cookie lifetime in ms, derived from JWT_EXPIRES_IN (e.g. "1d", "12h"). */
export function cookieMaxAgeMs(): number {
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(env.JWT_EXPIRES_IN.trim())
  if (!match) return 24 * 60 * 60 * 1000
  const value = Number(match[1])
  const unit = match[2] ?? 'd'
  const factor = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000
  return value * factor
}
