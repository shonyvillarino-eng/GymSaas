import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';

import { env, isProd } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { cookieMaxAgeMs, signAccessToken } from '../lib/jwt.js';
import { getDummyHash, hashPassword, verifyPassword } from '../lib/password.js';
import { hashToken } from '../lib/tokens.js';
import { AppError } from '../middlewares/errorHandler.js';
import { requireAuth } from '../middlewares/auth.js';
import { parseOrThrow } from '../validations/schemas.js';

export const authRouter = Router();

/** Brute-force protection for credential endpoints (per IP). */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 10 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const completeSetupSchema = z.object({
  token: z.string().min(10, 'Setup token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters'),
});

function setSessionCookie(res: Response, token: string) {
  res.cookie(env.JWT_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.JWT_COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: cookieMaxAgeMs(),
  });
}

function publicUser(user: {
  id: string;
  email: string | null;
  fullName: string;
  role: string;
  phone: string | null;
  avatarUrl: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
  };
}

/**
 * POST /api/v1/auth/login
 * Verifies credentials, rejects users of suspended gyms and issues the
 * session as an HttpOnly cookie (never accessible from JS).
 */
authRouter.post('/login', authLimiter, async (req: Request, res: Response) => {
  const { email, password } = parseOrThrow(loginSchema, req.body);

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      avatarUrl: true,
      role: true,
      passwordHash: true,
      isActive: true,
    },
  });

  // Constant-time path for unknown emails.
  const valid = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !valid) throw new AppError('Invalid credentials', 401);
  if (!user.isActive) throw new AppError('Account is disabled', 401);

  // Resolve the user's gym (if any) — including deactivated memberships, so
  // users of a suspended gym get a clear error instead of a gym-less session.
  const membership = await prisma.gymMembership.findFirst({
    where: { userId: user.id },
    orderBy: { isActive: 'desc' },
    select: { isActive: true, role: true, gym: { select: { id: true, name: true, isActive: true } } },
  });

  if (membership && !membership.gym.isActive) {
    throw new AppError('This gym has been suspended. Contact the platform administrator.', 403, {
      code: 'GYM_SUSPENDED',
    });
  }
  if (membership && !membership.isActive) {
    throw new AppError('You no longer have access to this gym', 403, {
      code: 'GYM_ACCESS_REVOKED',
    });
  }

  const gymId = membership?.gym.id ?? null;
  const effectiveRole = membership?.role ?? user.role;

  const token = signAccessToken({ sub: user.id, role: effectiveRole, gymId });
  setSessionCookie(res, token);

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  res.status(200).json({
    user: {
      ...publicUser(user),
      role: effectiveRole,
      gymId,
      gymName: membership?.gym.name ?? null,
    },
  });
});

/**
 * POST /api/v1/auth/logout
 * Clears the session cookie. The JWT itself is stateless and expires by TTL.
 */
authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie(env.JWT_COOKIE_NAME, { path: '/' });
  res.status(204).end();
});

/**
 * GET /api/v1/auth/me
 * Returns the authenticated session as currently stored in the database
 * (so role changes and suspension take effect immediately).
 */
authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  const ctx = req.auth!;
  res.json({
    user: {
      id: ctx.userId,
      email: ctx.email,
      fullName: ctx.fullName,
      role: ctx.role,
      gymId: ctx.gymId,
      gymName: ctx.gymName,
    },
  });
});

/**
 * POST /api/v1/auth/complete-setup
 * Redeems the single-use setup token returned once by the admin "create gym"
 * operation, setting the initial password. The password and token are never
 * emailed or logged by the platform.
 */
authRouter.post('/complete-setup', authLimiter, async (req: Request, res: Response) => {
  const { token, password } = parseOrThrow(completeSetupSchema, req.body);

  const record = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, isActive: true } } },
  });

  const now = new Date();
  if (!record || !['SETUP', 'INSTRUCTOR_INVITE', 'MEMBER_INVITE'].includes(record.type) || record.usedAt || record.expiresAt < now) {
    throw new AppError('This setup link is invalid or has expired', 400, {
      code: 'INVALID_SETUP_TOKEN',
    });
  }

  const passwordHash = await hashPassword(password);

  const claimed = await prisma.$transaction(async (tx) => {
    const tokenUpdate = await tx.authToken.updateMany({
      where: { id: record.id, type: record.type, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (tokenUpdate.count !== 1) return false;
    await tx.user.update({
      where: { id: record.userId },
      data: {
        passwordHash,
        isActive: true,
        ...(record.type === 'INSTRUCTOR_INVITE'
          ? { role: 'INSTRUCTOR' as const }
          : record.type === 'MEMBER_INVITE'
            ? { role: 'MEMBER' as const }
            : {}),
      },
    });
    if (record.type === 'INSTRUCTOR_INVITE') {
      await tx.gymMembership.updateMany({
        where: { userId: record.userId, role: 'INSTRUCTOR' },
        data: { isActive: true },
      });
    }
    if (record.type === 'MEMBER_INVITE') {
      // A member's gym membership is created with the profile; it is enabled here.
      await tx.gymMembership.updateMany({
        where: { userId: record.userId, role: 'MEMBER' },
        data: { isActive: true },
      });
    }
    return true;
  });
  if (!claimed) {
    throw new AppError('This setup link is invalid or has expired', 400, {
      code: 'INVALID_SETUP_TOKEN',
    });
  }

  res.status(200).json({ ok: true, email: record.user.email });
});
