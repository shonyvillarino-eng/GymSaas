import type { PrismaClient } from '@prisma/client'
import { getHealthStatus, getReadiness } from './status.js'

export type Health = ReturnType<typeof getHealthStatus>
export type Readiness = ReturnType<typeof getReadiness>

export { getHealthStatus, getReadiness, type Health, type Readiness }
