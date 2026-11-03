import { Router, type Request, type Response } from 'express'
import { requireAuth, requireRole } from '../middlewares/auth.js'
import { requireRole as requireSuperAdmin } from '../middlewares/auth.js'

export const portalRouter = Router()
portalRouter.use(requireAuth)

// App-level portal entrypoint (placeholder for future portal routes).
portalRouter.get('/health', (_req: Request, res: Response) => {
  res.json({ portal: 'ok' })
})
