import type { Request, Response } from 'express'

const readinessHandler: Parameters<Express.RequestHandler>[0] = async (_req, res) => {
  const ready = await checkReadiness()
  res.status(ready ? 200 : 503).json({
    ready,
    timestamp: new Date().toISOString(),
  })
}

export { readinessHandler }

async function checkReadiness() {
  return true
}
