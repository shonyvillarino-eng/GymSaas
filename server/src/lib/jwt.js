import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
export function signAccessToken(payload) {
    return jwt.sign(payload, env.JWT_SECRET, {
        expiresIn: env.JWT_EXPIRES_IN,
        issuer: 'gym-saas',
    });
}
/** Returns the verified payload, or null when the token is invalid/expired. */
export function verifyAccessToken(token) {
    try {
        const decoded = jwt.verify(token, env.JWT_SECRET, { issuer: 'gym-saas' });
        if (typeof decoded === 'string')
            return null;
        const { sub, role, gymId } = decoded;
        if (typeof sub !== 'string' || typeof role !== 'string')
            return null;
        if (gymId !== null && typeof gymId !== 'string')
            return null;
        return { sub, role, gymId: gymId ?? null };
    }
    catch {
        return null;
    }
}
/** Cookie lifetime in ms, derived from JWT_EXPIRES_IN (e.g. "1d", "12h"). */
export function cookieMaxAgeMs() {
    const match = /^(\d+)\s*(s|m|h|d)$/.exec(env.JWT_EXPIRES_IN.trim());
    if (!match)
        return 24 * 60 * 60 * 1000;
    const value = Number(match[1]);
    const unit = match[2];
    const factor = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
    return value * factor;
}
