# -------------------------------------------------------------------
# PROMPT_22 — Áreas de trabajo vistas desde README.md y el código real
# -------------------------------------------------------------------

Las FASES se basan en lo que README.md y el árbol actual indican como
pendiente, no en asegurar todo lo que la auditoría/implementación ya
haya cubierto. El equipo puede decidir qué se hace desde fuera.

Cada fase del PROMPT 22 tiene su propio bloque.

## FASE 0 — Proyecto protegido, sin secretos en el repo

De README.md y .env.example sale que el cubo S3 usa
`AWS_*` y `S3_*`, junto con `DATABASE_URL` y `SESSION_SECRET`.

Qué hace FASE 0 con eso:
- `server/.gitignore` ya cubre `.env`, `.env.local`, `.env.*.local`.
- `server/.gitignore` ahora también cubre `server/.pgdata/` (si la carpeta existe).
- Asegura que `server/.env` no esté versionado.
- Asegura que, en el cubo S3 de Freebuff, los archivos a restaurar estén
  listos antes de ejecutar el script de restauración.

## FASE 1 — Métricas: registro, protección, duplicados y cardinalidad

Identificados por README.md y el árbol:
- `server/src/lib/metrics.ts`
- `server/src/lib/health.ts`
- `server/src/routes/metrics.routes.ts`
- `server/src/lib/request_logger.ts`
- `server/src/middlewares/metrics.ts`

Qué se corrige en FASE 1:
- `logMetric` es un `write` al store antes de ATM/métricas de conexión.
- Prefix global: `gym.metrics`.
- Duplicados de prefijo: `gym.metrics.atm.*`, `gym.metrics.supabase.*`.
- `gauge` expone tanto `atmHealthy` como `atmHealthyN` como prometheus keys.
- Eliminar el registro de `requestId` por operación de health.

## FASE 2 — readiness: liveness, timeout, cancelación, estados HTTP

Identificados:
- `server/src/lib/readiness.ts`
- `server/src/routes/health.routes.ts`
- `server/src/routes/health.ts`
- `server/src/routes/health/status.ts`
- `server/src/routes/health/test.ts`
- `server/scripts/health-check.ts`
- `server/scripts/health-check.legacy.ts`
- `server/scripts/verify-db-connectivity.mjs`

Qué se corrige en FASE 2:
- `GET /api/v1/health/live` (`/live`) es puro, sin Base de datos.
- `POST /api/v1/health/ready` (`/ready`) hace `SELECT 1` abortable, con
  AbortController y timeout de 5 segundos.
- `/ready` responde 200/503 sin exponer detalles de BD.
- Se deja `GET /api/v1/health` para información general del proceso.

## FASE 3 — Autoasignación por instructores

Identificados:
- `server/src/validations/instructor.schemas.ts`
- `server/src/validations/instructor.schemas.ts` y `instructor.dto.ts`
- `server/src/routes/instructors.routes.ts`
- `server/src/controllers/instructor.controller.ts`
- frontend: `client/src/pages/GymInstructorFormPage.tsx`
  y `client/src/pages/GymInstructorDetailPage.tsx`

Qué se corrige en FASE 3:
- Endpoint `POST /api/v1/instructors/me/members` (o su equivalente
  documentado) permite autoejecución segura desde instructor logueado.
- Backend valida que el instructor asignado esté en el gimnasio del token.
- Frontend presenta listado con buscador en el formulario de socio.

## FASE 4 — Métodos de pago configurables por gimnasio

Identificados:
- `shared/src/enums.ts` (PaymentMethod)
- `server/src/validations/financial.schemas.ts`
- `server/src/routes/gym.routes.ts`
- `server/src/services/gymPreferences.ts`
- `server/src/services/financial.ts`
- frontend: pago de socio y formularios de pago

Qué se corrige en FASE 4:
- Validación backend: método de pago configurado en preferencias/caja.
- Frontend: formularios habilitados según `PaymentMethod`.

## FASE 5 — Moneda ARS y consistencia financiera

Identificados:
- `server/src/config/env.ts` / `server/src/config/env.js`
- `server/src/lib/financial.ts` / finanzas en general
- `server/src/services/financial.ts`
- `client/src/lib/format.ts`
- `server/src/routes/gym.routes.ts` y preferencias

Qué se corrige en FASE 5:
- PFL/SALDOS/SUBTOTAL en HISTORICO/SALDOS/REPORTES usan la moneda del
  contexto.
- FLUJO, MAPAS, APERTURA, CIERRE usan ARS.
- Frontend formatea ARS según configuración regional.

## FASE 6 — i18n completa

Identificados:
- `client/src/i18n/index.ts`
- `client/src/i18n/locales/es/common.json`
- `client/src/i18n/locales/en/common.json`
- `client/src/i18n/locales/pt/common.json`
- páginas de gimnasio y portal

Qué se corrige en FASE 6:
- Las rutas visibles usan las traducciones configuradas sin hardcoding de
  texto.
- Prioridad de idioma: `localStorage` > navegador.

## FASE 7 — Tema oscuro/controles nativos

Identificados:
- `client/src/styles/index.css`
- `client/src/components/ui/` (Button, Input, DataTable, etc.)
- `client/src/components/layout/` y modales

Qué se corrige en FASE 7:
- Selects/input/textarea usan `theme="dark"` o estilos en `index.css`.
- Modales y estados de UI se renderizan consistentemente.

## FASE 8 — Backups y restauración

Identificados:
- `docs/operations/backup-and-restore.md`
- `docs/operations/incident-response.md`
- `docs/operations/maintenance.md`
- scripts de verificación de DB y S3

Qué se corrige en FASE 8:
- Documentación de backup/restore actualizada con:
  - respaldo de BD
  - respaldo de archivos S3
  - script de restauración (envuelve los scripts existentes)
  - verificación en entorno aislado

## FASE 9 — CI y pruebas automatizadas

Identificados:
- `package.json` (workspaces)
- `server/package.json`
- `client/package.json`

Qué se corrige en FASE 9:
- GitHub Actions: typecheck, build, Prisma, tests de backend y frontend.
- `package.json` scripts de prueba donde existan, sin forzar tests si no hay.

## FASE 10 — Validación integral e informe

Con lo anterior:
- Se ejecuta validación end-to-end (manual o automatizada).
- Informe final `PROMPT_22_FINAL_REPORT.md` sintetiza el estado de cada fase.
