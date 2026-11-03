import { Router } from 'express'
import type { Request, Response } from 'express'

import { metricsRouter } from '../lib/metrics.js'
import { healthRouter } from './health.routes.js'

const router = Router()

router.use('/metrics', metricsRouter)
router.use('/health', healthRouter)

export { router as metricsRouter }
