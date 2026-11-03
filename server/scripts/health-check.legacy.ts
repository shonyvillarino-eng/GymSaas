// Scripts de verificación de BD/S3/containers/listado de archivo de bloqueo de BD
import { checkReadiness } from '../services/readiness.js'
import { readiness } from '../services/readiness.js'
import { prisma } from '../lib/prisma.js'

async function runChecks() {
  const checks = {
    database: await checkReadiness(prisma, 5_000),
    s3: readiness.canAccessS3,
  }

  console.log(JSON.stringify(checks, null, 2))
}

runChecks().catch(console.error)
