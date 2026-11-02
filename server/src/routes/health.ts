import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { getHealthStatus, getReadiness } from './health/status.js'

export const healthRouter = Router()

healthRouter.get('/health', async (_req, res) => {
  const health = await getHealthStatus(prisma)
  res.status(health.status === 'ok' ? 200 : 503).json(health)
})

healthRouter.get('/health/ready', async (_req, res) => {
  const readiness = await getReadiness(prisma)
  res.status(readiness.ready ? 200 : 503).json(readiness)
})

healthRouter.get('/health/live', (_req, res) => {
  res.status(200).json({ status: 'ok' })
})
