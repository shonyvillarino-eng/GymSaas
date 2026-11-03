// health/status.legacy.ts
// Retorna el estado del servidor sin detalles de la BD.
import { Router } from 'express'
import type { Request, Response } from 'express'

const router = Router()

router.get('/status', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    uptimeMs: Math.round(process.uptime() * 1000),
    timestamp: new Date().toISOString(),
  })
})

export { router as healthRouter }
