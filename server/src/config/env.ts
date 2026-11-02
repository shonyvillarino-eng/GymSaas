import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().url().default('postgresql://localhost:5432/gym_saas'),
  JWT_SECRET: z.string().min(32).default('change-me-in-production'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  JWT_COOKIE_NAME: z.string().default('gym_saas_token'),
  JWT_COOKIE_SECURE: z
    .union([z.literal('true'), z.literal('false')])
    .default('false')
    .transform((v) => v === 'true'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(300),
})

export const env = envSchema.parse(process.env)
export const isProd = env.NODE_ENV === 'production'

export type Env = z.infer<typeof envSchema>
