# Informe de Servidor

## Endpoints de Salud

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/health` | GET | Estado general del servidor |
| `/ready` | POST | Verifica conectividad de BD |
| `/metrics` | GET | Métricas de servidor |

El endpoint `/ready` usa `AbortController` para cancelar la consulta si supera el timeout de 5 segundos, evitando acumulación de conexiones.

## Métricas

Las métricas se registran con el prefijo `gym.metrics.` y se exponen en `/metrics`. Se usa un store en memoria que se puede reemplazar por un backend de métricas externo.

## Seguridad

- Los endpoints de health **no exponen detalles sensibles** (no se muestran errores de BD con stack traces)
- Las respuestas de errores incluyen solo `error: true` y `requestId` para correlación
- El middleware de métricas registra requests completados sin exponer datos sensibles

## Logs

Los logs incluyen:
- `requestId` para correlación
- Método, URL, status y duración de requests
- Eventos de auditoría para operaciones críticas

## Pruebas

Ver `PRUEBAS_SETUP.md` para instrucciones de verificación manual y automática.
