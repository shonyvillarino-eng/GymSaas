# Health and monitoring implementation notes

## /api/v1/health → readinessHandler
- Ready handler verifies Prisma is connected.
- /api/v1/health now delegates to readinessHandler from lib/health.

## /health and /health/live
- These remain root-level, no /api prefix.
- /health returns service name and timestamp.
- /health/live returns simple live check.

## Metrics
- metricsMiddleware records request metrics in memory.
- /api/v1/metrics reads metrics, /api/v1/metrics/clear clears them.
- metricsMiddleware is registered before routes.

## Log sanitization
- logger.ts includes redaction of secret-like keys.
- request_logger.ts uses safeStringify before logging.

## Environment
- env.ts validates required vars, exits on invalid config.
- .env.example documents Supabase placeholders.

## Next step
- Update docs/operations files to match current implementation.
