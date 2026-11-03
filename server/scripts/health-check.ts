import 'dotenv/config'
import { createApp } from '../src/app.js'
import { env } from '../src/config/env.js'
import { prisma } from '../src/lib/prisma.js'
import { getHealthStatus, getReadiness } from '../src/routes/health/status.js'

const app = createApp()
const server = app.listen(env.PORT, async () => {
  console.log(`Listening on http://localhost:${env.PORT}`)
  try {
    const health = await getHealthStatus(prisma)
    const readiness = await getReadiness(prisma)
    console.log(JSON.stringify({ health, readiness }, null, 2))
  } catch (error) {
    console.error(error)
    server.close()
    await prisma.$disconnect()
    process.exit(1)
  } finally {
    server.close()
    await prisma.$disconnect()
    process.exit(0)
  }
})

server.on('error', (error) => {
  console.error(error)
  process.exit(1)
})
