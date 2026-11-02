# Monitoreo y Operaciones

Este documento describe cómo monitorear y operar el backend de `gym-saas`.

## Endpoints de salud

| Método | Path | Descripción |
|--------|------|-------------|
| GET | `/health` | Health check básico. Retorna `200 OK` cuando el servicio está levantado. |
| GET | `/health/live` | Liveness check. Solo verifica que el proceso esté vivo. |
| GET | `/api/v1/health` | Readiness check. Verifica conectividad con PostgreSQL. |

Revisa el archivo `server/src/app.ts` para ver la implementación.

## Logs

Los logs se imprimen en stdout. En desarrollo se usa `morgan('dev')` y en producción `morgan('combined')`.

## Métricas

El proyecto puede incorporar un middleware de métricas en `server/src/middleware/metrics.ts`. Actualmente está en construcción.

## Incidentes

Si el servicio falla, revisa:

- Logs del proceso.
- Health check `/api/v1/health`.
- Variables de entorno en `server/.env`.
- Conexión a PostgreSQL.

## Mantenimiento

- Revisa logs periódicamente.
- Monitorea el cron de vida de membresías.
