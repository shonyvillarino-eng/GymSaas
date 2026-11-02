import { Router } from 'express'
import type { Request, Response } from 'express'

import { healthRouter } from './health.js'
import { metricsRouter } from './metrics.routes.js'

export const apiRouter = Router()

apiRouter.use('/health', healthRouter)
apiRouter.use('/metrics', metricsRouter)
