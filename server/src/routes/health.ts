// health/routes.legacy.ts
import { Router } from 'express'
import { readiness } from '../services/readiness.js'
import type { Request, Response } from 'express'

const router = Router()

router.get('/live', (_req: Request, res: Response) => {
  res.status(readiness.canAccessS3 ? 200 : 503).json(readiness.status)
})

router.get('/ready', (_req: Request, res: Response) => {
  res.status(readiness.canAccessS3 ? 200 : 503).json(readiness.status)
})

export { router as healthRouter }
