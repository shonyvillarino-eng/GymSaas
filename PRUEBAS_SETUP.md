# Pruebas de Disponibilidad y Health Endpoints

## Health Endpoints

El servidor expone los siguientes endpoints de salud:

### GET /health
Devuelve el estado general del servidor:
```json
{
  "status": "ok",
  "uptimeMs": 1234567,
  "env": "development",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### POST /ready
Verifica la conectividad con la base de datos:
```json
{
  "status": "ok",
  "ready": true,
  "timestamp": "2024-01-01T00:00:00.000Z",
  "database": {
    "connected": true,
    "latencyMs": 5
  }
}
```

### GET /metrics
Devuelve las métricas recopiladas:
```json
{
  "counters": {},
  "gauges": {
    "gym.metrics.requests.active": 1
  },
  "histograms": {}
}
```

## Verificación Manual

```bash
# Health general
curl http://localhost:3001/health

# Readiness (requiere BD conectada)
curl -X POST http://localhost:3001/ready

# Métricas
curl http://localhost:3001/metrics
```

## Verificación Automatizada

El script `server/scripts/verify-db-connectivity.mjs` verifica la conectividad:
```bash
npx tsx server/scripts/verify-db-connectivity.mjs
```

## Consideraciones de Seguridad

- Los endpoints de health **no exponen detalles sensibles** de la base de datos
- La respuesta de `/ready` solo indica si la BD está conectada o no, sin mensajes de error detallados
- Las métricas son **agregadas** y no contienen información identificable
