import type { Request, Response } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { parseOrThrow } from '../validations/schemas.js';

const SUPPORTED_LANGUAGES = ['es', 'en', 'pt'] as const;

const preferencesSchema = z
  .object({
    language: z.enum(SUPPORTED_LANGUAGES),
    locale: z.string().trim().regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Invalid locale').optional(),
    theme: z.enum(['light', 'dark', 'system']).optional(),
  })
  .strict();

const patchPreferencesSchema = z
  .object({
    language: z.enum(SUPPORTED_LANGUAGES).optional(),
    locale: z.string().trim().regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Invalid locale').optional(),
    theme: z.enum(['light', 'dark', 'system']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

function effectiveLanguage(personal: string | null | undefined, gym: string | null | undefined) {
  const candidate = personal ?? gym ?? 'es';
  return SUPPORTED_LANGUAGES.includes(candidate as (typeof SUPPORTED_LANGUAGES)[number]) ? candidate : 'es';
}

async function gymLanguageOf(gymId: string | null | undefined) {
  if (!gymId) return null;
  const gym = await prisma.gym.findUnique({ where: { id: gymId }, select: { language: true, locale: true } });
  return gym;
}

export async function getMyPreferences(req: Request, res: Response) {
  const userId = req.auth?.userId;
  if (!userId) throw new AppError('Unauthorized', 401);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { language: true, preferences: true },
  });
  if (!user) throw new AppError('User not found', 404);

  const prefs = (user.preferences as Record<string, unknown>) || {};
  const storedLanguage = user.language || (typeof prefs.language === 'string' ? prefs.language : null);
  const gym = await gymLanguageOf(req.auth?.gymId);

  res.json({
    data: {
      ...prefs,
      language: storedLanguage,
      // Personal preference > gym default > Spanish, resolved by the server.
      effectiveLanguage: effectiveLanguage(storedLanguage, gym?.language),
      gymLanguage: gym?.language ?? null,
      gymLocale: gym?.locale ?? null,
    },
  });
}

export async function updateMyPreferences(req: Request, res: Response) {
  const userId = req.auth?.userId;
  if (!userId) throw new AppError('Unauthorized', 401);

  const input = parseOrThrow(patchPreferencesSchema, req.body);
  const current = await prisma.user.findUnique({ where: { id: userId }, select: { language: true, preferences: true } });
  if (!current) throw new AppError('User not found', 404);

  const existingPrefs = (current.preferences as Record<string, unknown>) || {};
  const updatedPrefs = { ...existingPrefs, ...input };
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.language ? { language: input.language } : {}),
      preferences: updatedPrefs,
    },
    select: { language: true },
  });

  const gym = await gymLanguageOf(req.auth?.gymId);
  res.json({
    data: {
      ...updatedPrefs,
      language: updatedUser.language,
      effectiveLanguage: effectiveLanguage(updatedUser.language, gym?.language),
      gymLanguage: gym?.language ?? null,
      gymLocale: gym?.locale ?? null,
    },
  });
}
