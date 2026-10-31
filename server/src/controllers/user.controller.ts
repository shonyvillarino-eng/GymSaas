import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { parseOrThrow } from '../validations/schemas.js';
import { z } from 'zod';

const preferencesSchema = z.object({
  language: z.string().min(2).max(10).optional(),
  locale: z.string().min(2).max(20).optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'At least one field is required');

export async function getMyPreferences(req: Request, res: Response) {
  const userId = req.auth?.userId;
  if (!userId) throw new AppError('Unauthorized', 401);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { language: true, preferences: true },
  });
  if (!user) throw new AppError('User not found', 404);
  const prefs = (user.preferences as any) || {};
  res.json({ data: { language: user.language || prefs.language || null, ...prefs } });
}

export async function updateMyPreferences(req: Request, res: Response) {
  const userId = req.auth?.userId;
  if (!userId) throw new AppError('Unauthorized', 401);
  const input = parseOrThrow(preferencesSchema, req.body);
  const current = await prisma.user.findUnique({ where: { id: userId }, select: { language: true, preferences: true } });
  if (!current) throw new AppError('User not found', 404);
  const existingPrefs = (current.preferences as any) || {};
  const newPrefs = { ...existingPrefs, ...input };
  const updateData: any = { preferences: newPrefs };
  if (input.language) updateData.language = input.language;
  await prisma.user.update({ where: { id: userId }, data: updateData });
  res.json({ data: { language: input.language || current.language || newPrefs.language || null, ...newPrefs } });
}
