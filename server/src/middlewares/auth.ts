import type { NextFunction, Request, Response } from 'express';

import type { UserRole } from '@gym-saas/shared';

import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { AppError } from './errorHandler.js';

export interface AuthContext {
  userId: string;
  /** Null only for accounts without a sign-in identity (e.g. members). */
  email: string | null;
  fullName: string;
  /** Effective role, resolved from the database — never trusted from the token. */
  role: UserRole;
  gymId: string | null;
  gymName: string | null;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Validates the HttpOnly session cookie and loads the *current* state of the
 * user from the database:
 *
 * - the JWT proves identity only (role/gym claims are re-read from the DB);
 * - a disabled user is rejected even with a valid token;
 * - a user belonging to a suspended gym is rejected with 403 GYM_SUSPENDED,
 *   which is how suspension invalidates every active session immediately.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[env.JWT_COOKIE_NAME] as string | undefined;
    if (!token) throw new AppError('Authentication required', 401);

    const payload = verifyAccessToken(token);
    if (!payload) throw new AppError('Invalid or expired session', 401);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, fullName: true, role: true, isActive: true },
    });
    if (!user || !user.isActive) throw new AppError('Account is disabled', 401);

    // Resolve gym membership from the database (not from token claims).
    const membership = payload.gymId
      ? await prisma.gymMembership.findUnique({
          where: { gymId_userId: { gymId: payload.gymId, userId: user.id } },
          select: {
            isActive: true,
            role: true,
            gym: { select: { id: true, name: true, isActive: true } },
          },
        })
      : null;

    let gymId: string | null = null;
    let gymName: string | null = null;
    let role: UserRole = user.role;

    if (payload.gymId) {
      if (!membership) {
        throw new AppError('You no longer have access to this gym', 403, {
          code: 'GYM_ACCESS_REVOKED',
        });
      }
      // Suspension takes precedence: it explains why the membership is off.
      if (!membership.gym.isActive) {
        throw new AppError('This gym has been suspended', 403, { code: 'GYM_SUSPENDED' });
      }
      if (!membership.isActive) {
        throw new AppError('You no longer have access to this gym', 403, {
          code: 'GYM_ACCESS_REVOKED',
        });
      }
      gymId = membership.gym.id;
      gymName = membership.gym.name;
      role = membership.role;
    }

    req.auth = {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      role,
      gymId,
      gymName,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/** Role guard. Use after requireAuth; reads the DB-verified effective role. */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(new AppError('Authentication required', 401));
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(new AppError('Insufficient permissions', 403, { code: 'FORBIDDEN' }));
      return;
    }
    next();
  };
}
