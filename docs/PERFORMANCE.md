# Auditoría de rendimiento y escalabilidad

Fecha: 2026-10-31. Alcance: frontend React/Vite, API Express, Prisma/PostgreSQL y tareas periódicas.
Todas las cifras de este documento se midieron en el entorno local del proyecto; no son estimaciones.

## 1. Línea base

| Medición | Antes | Después |
| --- | --- | --- |
| Bundle inicial (`client/dist/assets/index-*.js`) | 1.386,26 kB (402,00 kB gzip) | 511,54 kB (160,34 kB gzip) |
| Chunks generados | 1 (todo el frontend) | 40+ (uno por módulo, más un chunk de gráficos) |
| Gráficos (Recharts) | En el bundle inicial | `AreaChart-*.js`, 366,06 kB, solo en pantallas con gráficos |
| Escáner QR (`jsQR`) | En el bundle inicial | `GymAttendanceScanPage-*.js`, 137,51 kB, solo al abrir el escáner |

El bundle inicial se redujo un **63 %** (242 kB gzip menos): un socio que abre el portal ya no descarga el panel administrativo, los reportes ni Recharts.

## 2. Problemas encontrados y corregidos

### 2.1 Endpoints del dashboard y reportes que no respondían

`dashboard.routes.ts` y `reports.routes.ts` montaban directamente funciones que **devuelven** el payload en lugar de escribir la respuesta. El resultado real era:

- `GET /api/v1/dashboard/overview` → la petición quedaba colgada hasta el timeout del cliente (medido: > 60 s).
- `GET /api/v1/reports/members` y `/reports/attendance` → igual, > 30 s.
- El resto de endpoints del dashboard respondía 500.

**Corrección:** adaptador compartido [`server/src/routes/respond.ts`](../server/src/routes/respond.ts) que resuelve el `gymId` desde la sesión y responde `{ data }`, dejando que Express 5 derive los rechazos al middleware central de errores. Los controladores siguen siendo reutilizables desde otros módulos.

### 2.2 SQL crudo con identificadores incorrectos

Las agregaciones de dashboard y reportes usaban `attendance`, `payment_record`, `gym_id`, `check_in_time`, `paid_at`… Prisma no define `@@map`, así que las tablas y columnas reales son `"Attendance"`, `"PaymentRecord"`, `"gymId"`, `"checkInTime"`, `"paidAt"`. PostgreSQL respondía `42P01 relation does not exist`.

**Corrección:** identificadores entrecomillados en las 7 consultas crudas. Las estadísticas de asistencia, ingresos y membresías ahora devuelven datos reales.

Además:

- `COALESCE("method", 'UNKNOWN')` fallaba con `22P02` porque `method` es un enum de PostgreSQL; se castea a `text`.
- La suma de ingresos del reporte financiero se truncaba a `bigint` (29,99 → 30); ahora es `numeric(12,2)`.
- El resumen de asistencias del reporte asignaba `acc.total = row.total` en cada fila del `GROUP BY`, por lo que el total del período era el del último grupo. Ahora acumula.

### 2.3 Dashboard: 13 consultas secuenciales

`getDashboardOverview` ejecutaba trece `await` en serie y una decimocuarta consulta dentro del objeto de retorno. Ahora las catorce se resuelven en un único `Promise.all`: el tiempo de la tarjeta inicial pasa de la suma de latencias a la de la consulta más lenta. Mediana actual: **25 ms** (n=5, local).

También se corrigió el indicador de deuda: sumaba `originalAmount` de las obligaciones abiertas (ignorando `paidAmount`), por lo que un cargo parcialmente pagado figuraba como deuda completa. Ahora la deuda es `originalAmount - paidAmount` y excluye obligaciones canceladas. El probe [`server/scripts/verify-performance.mjs`](../server/scripts/verify-performance.mjs) compara el indicador con el agregado calculado directamente en PostgreSQL.

### 2.4 N+1 en generación de obligaciones y asignación de socios

- `generateObligations` hacía un `findFirst` por cada suscripción (hasta 500). Ahora resuelve las suscripciones ya cobradas con un único `findMany` y usa un `Set` en el bucle. Se mantiene la idempotencia (restricción única `gymId + subscriptionId + concept`).
- `assignMembers` (asignación individual y masiva de instructor) hacía un `findFirst` por socio dentro de la transacción. Ahora lee todas las asignaciones activas del lote con una consulta y las indexa en un `Map`.
- `getInstructor` lanzaba una consulta dentro del array de `Promise.all` (serializaba las otras tres). Ahora se inicia antes y se encadena.

### 2.5 Índices para el barrido de vencimientos

El proceso periódico actualiza membresías filtrando solo por `status` y `endDate`/`startDate`, sin `gymId`, así que los índices existentes (`gymId + status`, `gymId + endDate`) no podían usarse.

Migración [`20261031120000_membership_lifecycle_indexes`](../server/prisma/migrations/20261031120000_membership_lifecycle_indexes/migration.sql):

```sql
CREATE INDEX "MemberSubscription_status_endDate_idx" ON "MemberSubscription"("status", "endDate");
CREATE INDEX "MemberSubscription_status_startDate_idx" ON "MemberSubscription"("status", "startDate");
```

Aplicada en local con `prisma migrate deploy`. Es aditiva (no reescribe datos).

### 2.6 Concurrencia del proceso periódico

El `setInterval` de vencimientos podía solaparse consigo mismo si una ejecución tardaba más de 60 s. Ahora existe un flag `running` (no se solapan ticks) y se omite en `NODE_ENV=test`. Las actualizaciones son idempotentes, de modo que varias instancias no corrompen datos; si en el futuro se necesita ejecución única entre instancias, hará falta un lock a nivel de base de datos o un scheduler externo (ver limitaciones).

### 2.7 Diagnóstico en producción

- Middleware de contexto: propaga/crea `X-Request-Id` y registra en JSON las peticiones que superan `SLOW_REQUEST_MS` (por defecto 1000 ms) sin body, query ni tokens.
- El middleware de errores registra los 5xx en producción con el `request_id`, sin stack ni datos de la petición.
- `GET /health` es liveness puro; `GET /api/v1/health` comprueba la base con `SELECT 1`, devuelve `database.latencyMs` y responde **503** cuando PostgreSQL no está disponible, sin exponer la cadena de conexión.
- Cierre ordenado: `SIGINT`/`SIGTERM` detienen el timer, cierran el servidor y desconectan Prisma.

## 3. Pruebas ejecutadas (resultados reales)

```
npm run typecheck        → OK (shared, server, client)
npm run build            → OK; bundle inicial 511,54 kB / 160,34 kB gzip
npx prisma validate      → schema válido
npx prisma migrate deploy→ 20261031120000_membership_lifecycle_indexes aplicada
node scripts/verify-performance.mjs → 7 endpoints medidos + consistencia con PostgreSQL
```

Mediciones del probe (local, n=5, datos del seed):

| Endpoint | Mediana | Mín / Máx |
| --- | --- | --- |
| `dashboard/overview` | 25 ms | 14 / 106 ms |
| `dashboard/attendance` | 8 ms | 6 / 11 ms |
| `dashboard/revenue` | 6 ms | 5 / 6 ms |
| `dashboard/memberships` | 7 ms | 6 / 8 ms |
| `reports/members` | 9 ms | 8 / 23 ms |
| `reports/attendance` | 7 ms | 6 / 14 ms |
| `reports/financial` | 12 ms | 7 / 20 ms |

Suites de integración (API real + PostgreSQL, datos limpiados al final):

| Suite | Resultado |
| --- | --- |
| `verify-gym-admin` | 12 checks |
| `verify-members` | 16 checks |
| `verify-financials` | 16 checks |
| `verify-attendance` | 13 checks, 1 skipped (cámara física) |
| `verify-routines` | 13 checks, 1 skipped |
| `verify-member-portal` | 14 checks |

Total: **84 comprobaciones**, 2 omitidas por requerir hardware. Las suites que corren después de otras pueden recibir `429` por el límite de 50 intentos de autenticación cada 15 minutos; se resolvió reiniciando el proceso entre tandas. Esto es el rate limiting funcionando, no un fallo funcional.

## 4. Cambios de rendimiento por área

- **Frontend:** `React.lazy` por ruta en [`client/src/App.tsx`](../client/src/App.tsx) y `Suspense` dentro de `AppLayout` para mantener el shell visible mientras se descarga el chunk. Login y setup siguen en el bundle inicial (primera pintura).
- **Backend:** un `Promise.all` en el resumen del dashboard, dos N+1 eliminados, un `Promise.all` desbloqueado en instructores.
- **Base de datos:** dos índices nuevos justificados por el barrido global; sin cambios de esquema destructivos.
- **Operación:** request id, log de peticiones lentas, health con base, cierre ordenado, migración aditiva.

## 5. Limitaciones conocidas

1. **Exportación PDF/XLSX pendiente.** `GET /api/v1/reports/export` devuelve el dataset en JSON; los botones de exportación de la UI esperan un archivo y todavía no generan PDF/Excel. Antes de este cambio el endpoint colgaba la petición.
2. **Zona horaria del dashboard.** Las agregaciones usan la fecha del servidor (`new Date()` y `DATE_TRUNC` sin `AT TIME ZONE`), no la zona del gimnasio. Los cortes de "hoy"/"mes" pueden diferir en gimnasios lejanos. Requiere pasar `gym.timezone` a las consultas crudas.
3. **Sin medición de carga real.** No se ejecutaron pruebas de carga ni con volumen sintético; las latencias son de un seed pequeño. Para afirmar capacidad hace falta un dataset representativo y `autocannon`/`k6` en un entorno de pruebas.
4. **Scheduler multi-instancia.** El flag `running` evita solapamientos dentro de un proceso, pero no coordina varias instancias. Las operaciones son idempotentes; para ejecución única se necesitaría un lock de base de datos o un cron externo.
5. **Rate limit en memoria.** `express-rate-limit` usa el store por defecto (memoria), por lo que no se comparte entre instancias. En despliegue multi-instancia, usar un store compartido.
6. **Pool de conexiones.** No se configura `connection_limit` explícito en `DATABASE_URL`; conviene ajustarlo al límite del proveedor PostgreSQL.

## 6. Recomendaciones priorizadas

1. Medir con un dataset de al menos ~100 k asistencias y ~20 k pagos antes de optimizar más.
2. Implementar la exportación PDF/XLSX en el backend.
3. Aplicar la zona horaria del gimnasio a las agregaciones de dashboard y reportes.
4. Evaluar `manualChunks` para separar React/router del bundle inicial (hoy 511 kB, sin advertencia crítica).
5. Añadir store compartido para rate limiting y un lock de base para el scheduler cuando se despliegue más de una instancia.
6. Revisar `EXPLAIN ANALYZE` de las consultas de reportes con volumen real; los índices actuales cubren los filtros del código, pero solo una medición con datos reales lo confirma.
