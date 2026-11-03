# Health checks

El servidor expone tres puntos de health:

- `GET /api/v1/health` — estado general del servidor (no BD).
- `POST /api/v1/health/ready` — verifica `SELECT 1` con timeout de 5s y AbortController; responde 200/503.
- `GET /api/v1/health/live` — liveness puro, sin consulta a BD.

Verificación manual:

```bash
curl -s http://localhost:3001/api/v1/health | jq .
curl -s -X POST http://localhost:3001/api/v1/health/ready | jq .
curl -s http://localhost:3001/api/v1/health/live | jq .
```

Para pruebas de integración, `server/scripts/verify-db-connectivity.mjs` ejecuta
`POST /api/v1/health/ready` contra el servidor local sin exponer claves.
