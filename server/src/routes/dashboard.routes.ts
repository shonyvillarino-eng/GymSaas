import { Router } from 'express'
import type { Request, Response } from 'express'
import { metrics } from '../services/metrics.js'

const router = Router()

router.get('/health', async (_req: Request, res: Response) => {
  const data = await metrics.collect()
  res.json({ status: 'ok', metrics: data })
})

router.get('/stats', async (_req: Request, res: Response) => {
  res.json({ uptime: process.uptime(), env: process.env.NODE_ENV })
})

export { router as dashboardRouter }
