import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { PrismaClient } from '@prisma/client';

export const authRouter = Router();
const prisma = new PrismaClient();

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
});

/**
 * POST /api/v1/auth/login
 * Validates the payload. Full credential verification is implemented in the
 * auth feature stage (JWT + HttpOnly cookie).
 */
authRouter.post('/login', async (req: Request, res: Response) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, email: true, role: true, isActive: true },
  });

  if (!user || !user.isActive) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  // Password verification + JWT/cookie issuance lands in the auth feature stage.
  res.status(501).json({
    error: 'Not implemented yet',
    hint: 'Login verification will be enabled in the authentication stage.',
  });
});

authRouter.get('/me', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Not implemented yet' });
});