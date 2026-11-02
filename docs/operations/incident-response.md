# Respuesta a Incidentes

## Pasos generales

1. Identificar el alcance del problema.
2. Revisar logs (`server/src/app.ts`).
3. Verificar salud: `/api/v1/health`.
4. Contactar al equipo de operaciones.

## Escenarios comunes

- **Backend caído**: reiniciar proceso, revisar logs.
- **DB inaccesible**: revisar `DATABASE_URL`, estado de Supabase.
- **Despliegue defectuoso**: revertir versión.
- **Datos corruptos**: restaurar desde copia.
- **Notificaciones detenidas**: revisar logs de `server/src/services/notifications.ts`.

El archivo `docs/operations/maintenance.md` tiene detalles de mantenimiento preventivo.
