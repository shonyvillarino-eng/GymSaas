import { Router } from 'express'
import type { Request, Response } from 'express'
import { metricsMiddleware } from '../middlewares/metrics.js'

const router = Router()

router.use(metricsMiddleware)

export { router as metricsRouter, metricsMiddleware }
