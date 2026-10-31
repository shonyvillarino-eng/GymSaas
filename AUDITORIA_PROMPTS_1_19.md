# Auditoría técnica — Prompts 1 a 19

Fecha: 2026-10-31 · Alcance: monorepo completo (React/Vite + Express + Prisma/PostgreSQL).
Modo: **auditoría de solo lectura**. No se modificó código, esquema, configuración ni datos. El único archivo creado es este informe.

---

## A. Resumen ejecutivo

### Estado general

El proyecto es un SaaS multi-tenant real y funcional en su núcleo: autenticación con cookies HttpOnly, RBAC verificado en el servidor, aislamiento por gimnasio en las consultas, socios, instructores, membresías, pagos con obligaciones y anulaciones, asistencia manual/QR, rutinas con versiones, portal del socio, reportes administrativos, auditoría de escritura y compilación limpia. Las suites de integración contra PostgreSQL pasaron **84 comprobaciones** sobre el código actual.

Sin embargo, **no todos los prompts están completos**. Los huecos principales son de integración y de producto, no de compilación:

- **Internacionalización**: existe i18next, tres archivos de traducción y endpoints de preferencias, pero **ningún componente usa `useTranslation`**; toda la UI está en inglés codificado. No hay selector de idioma.
- **Notificaciones**: existen API y modelos, pero **no hay scheduler, ni correo, ni generación automática**; publicar un aviso no crea notificaciones; la campana muestra datos ficticios.
- **Auditoría**: se escribe en `AuditLog`, pero **no existe endpoint ni pantalla para consultarla**.
- **Reportes**: las métricas funcionan, pero la sección está marcada "Pending" y apunta al dashboard en el menú; la exportación "PDF/XLSX" **devuelve JSON**.
- **Pruebas**: hay suites de integración ejecutables, pero **no hay framework de tests unitarios ni CI**.

### Recuento de requisitos evaluados

Se evaluaron **63 requisitos funcionales** en la tabla C:

| Estado | Cantidad |
| --- | --- |
| IMPLEMENTADO Y VERIFICADO | **37** |
| PARCIALMENTE IMPLEMENTADO | **9** |
| IMPLEMENTADO, NO VERIFICADO | **2** |
| NO IMPLEMENTADO | **12** |
| FALLIDO | **2** |
| BLOQUEADO | **1** |
| **Total** | **63** |

### Riesgos críticos

1. **Avisos administrativos sin filtro de audiencia** (`GET /api/v1/notifications/announcements`): cualquier usuario autenticado del gimnasio recibe todos los avisos publicados, incluidos los dirigidos a un socio/instructor concreto y los expirados. Riesgo de privacidad dentro del tenant.
2. **Exportaciones inexistentes**: los botones PDF/Excel descargan JSON; no hay archivo ni `Content-Disposition`.
3. **i18n no aplicada**: el requisito de tres idiomas en toda la aplicación no se cumple; no es un detalle visual menor.
4. **Sesión no invalidable**: el logout borra la cookie, pero el JWT sigue siendo válido hasta expirar (1 día) si fue capturado.
5. **Departamento de auditoría inaccesible**: no hay forma de revisar los eventos registrados desde la aplicación.

### Módulos más incompletos

Notificaciones/comunicaciones (Prompt 15), internacionalización (Prompt 14), auditoría consultable (Prompt 16), exportaciones y navegación de reportes (Prompt 13), CI/despliegue real (Prompt 18).

### ¿Preparado para el Prompt 20?

**Sí para continuar la hoja de ruta, no para considerarlo producción terminada.** La base técnica es sólida y los fallos detectados son corregibles sin reescritura. Se recomienda **OPCIÓN B**: corregir P0/P1 antes de avanzar.

---

## B. Tabla de auditoría de los prompts 1–19

| Prompt | Módulo | Estado | Evidencias | Problemas detectados | Acción recomendada |
| --- | --- | --- | --- | --- | --- |
| 1 | Arquitectura y configuración | IMPLEMENTADO Y VERIFICADO | Monorepo `shared`/`server`/`client`; scripts reales (`dev`, `build`, `typecheck`, `start`); `server/src/config/env.ts` valida con Zod; Vite proxy; `tsc` limpio en los tres workspaces | No hay linter configurado; `Dockerfile` es un placeholder | Añadir lint/format y completar o retirar el Dockerfile |
| 2 | Base de datos y modelos | IMPLEMENTADO Y VERIFICADO | `schema.prisma`: 25 modelos, 26 enums, índices compuestos y unicidades; 12 migraciones aplicadas (`migrate status`); `prisma validate` OK | `Gym.language`/`locale` existen y no se usan; índices nuevos de ciclo de vida recién añadidos | Ninguna crítica; documentar campos sin uso |
| 3 | Autenticación, roles y seguridad | PARCIALMENTE IMPLEMENTADO | Login/logout/me en `auth.routes.ts`; cookie HttpOnly + `SameSite=Lax`; scrypt; comparación de tiempo constante; RBAC con rol releído de DB en `middlewares/auth.ts` | **No hay recuperación de contraseña**; logout no invalida el JWT; no hay refresh token; sin CSRF token explícito (mitigado por SameSite y JSON) | Implementar reset por token; valorar denylist/rotación de sesión |
| 4 | Superadministrador | IMPLEMENTADO Y VERIFICADO | `admin.routes.ts` con `SUPER_ADMIN`; CRUD de gimnasios, suspender/reactivar, detalle, miembros, instructores, actividad; stats reales con `Promise.all`; suite `verify-gym-admin` (12 checks) | Falta edición de datos fiscales/website/description en la UI; `gyms.routes.ts` responde 501 sin autenticar | Completar campos o retirar la ruta 501 |
| 5 | Administración del gimnasio | PARCIALMENTE IMPLEMENTADO | `gym.routes.ts` (perfil, logo, preferencias, password); `GymSettingsPage` con negocio, logo, horarios, política, recibos, notificaciones; `updateMyGym` usa `gymId` de sesión | **Idioma predeterminado del gimnasio no configurable**; logo requiere S3 (no configurado → 503); no edita `legalName`, `taxId`, `website`, `description` | Añadir localización por gimnasio y validar el resto de campos |
| 6 | Gestión de socios | IMPLEMENTADO Y VERIFICADO | `members.routes.ts`; `member.controller.ts`; búsqueda, filtros, paginación backend, unicidad de documento, estados, foto; `verify-members` (16 checks) | La "baja" es cambio de estado (no borrado físico), coherente con el histórico | Ninguna |
| 7 | Instructores y asignación | IMPLEMENTADO Y VERIFICADO | CRUD + invitación one-time; asignación individual/masiva; instructor solo ve asignados (`isAssignedToMember`); `verify-routines`/`verify-attendance` prueban el bloqueo | La asignación depende de la UI de detalle (existe); no hay reasignación masiva desde instructor | Ninguna |
| 8 | Membresías y planes | IMPLEMENTADO Y VERIFICADO | `membership.controller.ts`, `subscriptions.routes.ts`, `services/subscriptions.ts`; renovación, cancelación, expiración periódica; `verify-financials`/`verify-members` | Concurrencia de renovaciones no probada específicamente (hay `pg_advisory_xact_lock`); fechas calculadas con días fijos (30/91/182/365) | Añadir prueba de concurrencia |
| 9 | Cobros, pagos y deudas | IMPLEMENTADO Y VERIFICADO | Pagos manuales, parciales, anulaciones, obligaciones, caja, recibos PDF; contador de recibos con `ON CONFLICT`; `verify-financials` (16 checks) | Reporte financiero tiene lógica duplicada (Prisma + SQL crudo) | Unificar cálculo y cubrir con prueba de importes |
| 10 | Asistencia manual y QR | IMPLEMENTADO Y VERIFICADO | `attendance.routes.ts`; política configurable; duplicados con tolerancia; QR opaco revocable; `verify-attendance` (13 checks, 1 skip por cámara) | La captura por cámara no se probó (requiere dispositivo) | Probar el escaneo en un dispositivo real |
| 11 | Rutinas | IMPLEMENTADO Y VERIFICADO | `routine.controller.ts`; versiones inmutables; asignación; permisos por rol; `verify-routines` (13 checks, 1 skip) | Sin registro de ejercicios completados (correcto según requisito); no hay prueba visual del builder | Prueba E2E del builder |
| 12 | Portal del socio | IMPLEMENTADO Y VERIFICADO | `member-portal.routes.ts` (solo lectura salvo perfil/password); resolución del socio desde sesión; `verify-member-portal` (14 checks) | **No hay botón para invitar a un socio al portal** (la API `POST /members/:id/portal-access` existe) | Añadir acción en el detalle del socio |
| 13 | Dashboard y reportes | PARCIALMENTE IMPLEMENTADO | `/dashboard/overview|attendance|revenue|memberships` y `/reports/*` funcionan con datos reales (probe: 7 endpoints, 6–25 ms); Recharts; filtros; reportes por página | **Exportación devuelve JSON**, no PDF/XLSX; el menú marca Reportes "Pending" y apunta a `/gym`; el landing `/gym` no usa `/dashboard/overview`; zona horaria del servidor | Corregir export, enlazar Reportes y unificar el landing |
| 14 | Configuración, idioma y región | PARCIALMENTE IMPLEMENTADO | i18next + 3 locales + `LanguageDetector`; `GET/PATCH /users/me/preferences`; selector de tema | **0 componentes usan `useTranslation`**; sin selector de idioma; `Gym.language` sin API/UI; formatos con `toLocaleDateString` del navegador y moneda manual | Aplicar i18n en toda la UI y persistir la prioridad personal > gimnasio > es |
| 15 | Notificaciones y comunicaciones | PARCIALMENTE IMPLEMENTADO | Modelos `Notification`, `Announcement`, `NotificationPreference`, `NotificationLog`; API CRUD de avisos y preferencias; página de avisos derivados del portal | **Sin scheduler**, sin generación automática, sin correo; publicar un aviso no crea notificaciones; campana con datos ficticios; sin UI de avisos; sin idempotencia/log | Implementar generación, scheduler y correo, o declarar el módulo como no operativo |
| 16 | Seguridad avanzada y auditoría | PARCIALMENTE IMPLEMENTADO | Zod `.strict()`; aislamiento verificado (404 cross-gym en suites); 69 llamadas de auditoría; Helmet, CORS, rate limit, errores sin stack en producción | **No hay consulta/pantalla de auditoría**; anuncios sin filtro de audiencia; logout no revoca JWT; `GET /api/v1/gyms` 501 público | Endpoint de auditoría con aislamiento; filtrar avisos por audiencia |
| 17 | Pruebas integrales | PARCIALMENTE IMPLEMENTADO | 6 suites de integración (84 checks) + probe de rendimiento; cubren auth, permisos, cross-gym, finanzas, asistencia, rutinas, portal | **Sin framework unitario ni `npm test`**; sin CI; suites dependen de API+DB vivas y del rate limit | Añadir Vitest/Supertest y CI que ejecute ambas capas |
| 18 | Despliegue | PARCIALMENTE IMPLEMENTADO | Build de client/server OK; `.env.example`; health con DB; migraciones `deploy`; README con arquitectura, HTTPS, backups, storage | **Sin CI/CD**; `Dockerfile` placeholder; no hay despliegue verificado; backups solo documentados; S3 sin configurar | Completar pipeline y probar despliegue real |
| 19 | Rendimiento y escalabilidad | IMPLEMENTADO Y VERIFICADO | Bundle inicial 1.386→511 kB; 14 consultas del dashboard en `Promise.all`; N+1 eliminados; índices de ciclo de vida; request-id, slow logs, health DB; `docs/PERFORMANCE.md` | Sin pruebas de carga ni volumen; scheduler multi-instancia no coordinado; rate limit en memoria | Medir con dataset representativo |

---

## C. Tabla de funcionalidades

| # | Funcionalidad | Estado | Evidencia | Problema | Prioridad |
| --- | --- | --- | --- | --- | --- |
| 1 | Estructura monorepo y TypeScript | IMPLEMENTADO Y VERIFICADO | `package.json` workspaces; `tsc` OK | — | — |
| 2 | Validación de variables de entorno | IMPLEMENTADO Y VERIFICADO | `server/src/config/env.ts` (Zod, exit 1) | — | — |
| 3 | 25 modelos / 12 migraciones | IMPLEMENTADO Y VERIFICADO | `schema.prisma`; `migrate status` al día | — | — |
| 4 | Restricciones e índices | IMPLEMENTADO Y VERIFICADO | `@@unique`, `@@index`, índices parciales SQL | — | — |
| 5 | Login / logout / sesión | IMPLEMENTADO Y VERIFICADO | `auth.routes.ts`; cookie HttpOnly; suites | — | — |
| 6 | RBAC en backend | IMPLEMENTADO Y VERIFICADO | `requireRole` sobre rol de DB; suites 403 | — | — |
| 7 | Panel superadmin | IMPLEMENTADO Y VERIFICADO | `admin.routes.ts`; `verify-gym-admin` 12 checks | — | — |
| 8 | Bloqueo entre roles | IMPLEMENTADO Y VERIFICADO | Suites: MEMBER/INSTRUCTOR/SUPER_ADMIN bloqueados en finanzas | — | — |
| 9 | Configuración del gimnasio | IMPLEMENTADO Y VERIFICADO | `gym.controller.ts`; `GymSettingsPage` | — | — |
| 10 | Horarios, política y recibos | IMPLEMENTADO Y VERIFICADO | `gym-admin.schemas.ts`; UI; `attendancePolicy` aplicada en check-in | — | — |
| 11 | CRUD y búsqueda de socios | IMPLEMENTADO Y VERIFICADO | `member.controller.ts`; paginación; `verify-members` 16 | — | — |
| 12 | Estados y duplicados de socios | IMPLEMENTADO Y VERIFICADO | `memberStatusSchema`; unicidad documento por gimnasio | — | — |
| 13 | Alta e invitación de instructores | IMPLEMENTADO Y VERIFICADO | `instructor.controller.ts`; `AuthToken INSTRUCTOR_INVITE`; UI muestra link | — | — |
| 14 | Asignación y alcance del instructor | IMPLEMENTADO Y VERIFICADO | `InstructorMember`; `isAssignedToMember`; suites | — | — |
| 15 | Planes de membresía | IMPLEMENTADO Y VERIFICADO | `membership.controller.ts`; UI | — | — |
| 16 | Asignación, renovación y vencimiento | IMPLEMENTADO Y VERIFICADO | `subscriptions` service; timer idempotente | Concurrencia no probada | P3 |
| 17 | Pagos manuales, parciales y anulaciones | IMPLEMENTADO Y VERIFICADO | `payment.controller.ts`; `verify-financials` 16 | — | — |
| 18 | Deudas y saldos | IMPLEMENTADO Y VERIFICADO | `FinancialObligation.paidAmount`; dashboard corregido | — | — |
| 19 | Recibo PDF | IMPLEMENTADO Y VERIFICADO | `services/receipt.ts`; script valida `application/pdf` | — | — |
| 20 | Asistencia manual/QR y duplicados | IMPLEMENTADO Y VERIFICADO | `attendance.controller.ts`; `verify-attendance` 13 | — | — |
| 21 | Alcance y revocación del QR | IMPLEMENTADO Y VERIFICADO | `findFirst({gymId, qrToken})`; revocación auditada | — | — |
| 22 | Rutinas, versiones y asignación | IMPLEMENTADO Y VERIFICADO | `RoutineVersion`; `assertCanModifyRoutine` | — | — |
| 23 | Rutinas de solo lectura para el socio | IMPLEMENTADO Y VERIFICADO | Sin rutas de escritura para MEMBER; filtro DRAFT | — | — |
| 24 | Portal del socio | IMPLEMENTADO Y VERIFICADO | 10 endpoints; `verify-member-portal` 14 | — | — |
| 25 | Cambio de contraseña del socio | IMPLEMENTADO Y VERIFICADO | `PATCH /member-portal/password` con contraseña actual | — | — |
| 26 | Métricas del dashboard | IMPLEMENTADO Y VERIFICADO | 4 endpoints; probe 6–25 ms; consistencia con DB | — | — |
| 27 | Reportes por página | IMPLEMENTADO Y VERIFICADO | `/reports/members|attendance|financial`; páginas | — | — |
| 28 | Aislamiento de reportes/dashboard | IMPLEMENTADO Y VERIFICADO | `gymId` desde sesión; probe y suites | — | — |
| 29 | Auditoría de escritura | IMPLEMENTADO Y VERIFICADO | 69 coincidencias de llamadas `audit`/`writeAudit`; login/CRUD/pagos/asistencias | — | — |
| 30 | Validación de entradas | IMPLEMENTADO Y VERIFICADO | Zod `.strict()` en controladores | Middleware `validate.ts` sin uso | P3 |
| 31 | Cabeceras, CORS, rate limit y errores | IMPLEMENTADO Y VERIFICADO | `app.ts`; error handler sin stack en prod | — | — |
| 32 | Suites de integración | IMPLEMENTADO Y VERIFICADO | 84 checks ejecutados en la sesión | Dependen de API/DB y rate limit | P2 |
| 33 | Compilación y esquema | IMPLEMENTADO Y VERIFICADO | `typecheck`, `build`, `prisma validate` | — | — |
| 34 | Env de ejemplo y health | IMPLEMENTADO Y VERIFICADO | `.env.example`; `/health` y `/api/v1/health` con DB | — | — |
| 35 | Migraciones de producción | IMPLEMENTADO Y VERIFICADO | `prisma migrate deploy` aplicado en local | No probado en proveedor | P2 |
| 36 | Optimizaciones de rendimiento | IMPLEMENTADO Y VERIFICADO | `docs/PERFORMANCE.md`; build 511 kB; probe | Sin carga real | P2 |
| 37 | Documentación de rendimiento | IMPLEMENTADO Y VERIFICADO | `docs/PERFORMANCE.md` | — | — |
| 38 | Invalidación de sesión al cerrar sesión | PARCIALMENTE IMPLEMENTADO | `clearCookie` en logout | JWT válido hasta expirar | P2 |
| 39 | Idioma predeterminado del gimnasio | NO IMPLEMENTADO | `Gym.language` sin endpoint ni UI | Requisito del Prompt 14 | P1 |
| 40 | Logo en almacenamiento externo | BLOQUEADO | `lib/objectStorage.ts`; S3_* vacío → 503 | Falta configuración/credenciales | P2 |
| 41 | Invitación al portal desde la UI | PARCIALMENTE IMPLEMENTADO | `POST /members/:id/portal-access` | Sin botón en el detalle del socio | P1 |
| 42 | Landing con métricas reales | PARCIALMENTE IMPLEMENTADO | `/gym` usa solo `GET /gym` | Las métricas viven en `/gym/reports`, oculto | P1 |
| 43 | Gráficos Recharts | IMPLEMENTADO, NO VERIFICADO | `GymReportsPage.tsx`; build genera `AreaChart` | No se inspeccionó visualmente | P2 |
| 44 | Exportación PDF/Excel | FALLIDO | `GET /reports/export?format=xlsx` → `application/json` | No genera archivo ni `Content-Disposition` | P1 |
| 45 | Zona horaria en métricas | PARCIALMENTE IMPLEMENTADO | Dashboard usa `new Date()`/`DATE_TRUNC` | Cortes "hoy/mes" con hora del servidor | P2 |
| 46 | Infraestructura i18n | IMPLEMENTADO, NO VERIFICADO | `client/src/i18n/index.ts`; 3 locales | Cargada pero no consumida | P2 |
| 47 | Traducción real de la interfaz | NO IMPLEMENTADO | 0 usos de `useTranslation` en 45 páginas | Textos hardcodeados en inglés | P1 |
| 48 | Selector de idioma personal | PARCIALMENTE IMPLEMENTADO | API `/users/me/preferences` | Sin UI; `LanguageDetector` usa localStorage/navegador | P1 |
| 49 | Prioridad personal > gimnasio > es | NO IMPLEMENTADO | Sin consumidor de preferencias | i18n no cambia por usuario | P1 |
| 50 | Formatos regionales | PARCIALMENTE IMPLEMENTADO | `toLocaleDateString()`; `${value.toFixed(2)} ${currency}` | No usa locale ni `Intl.NumberFormat` | P2 |
| 51 | Centro de notificaciones | PARCIALMENTE IMPLEMENTADO | API `/notifications`; página portal con avisos derivados | Campana con datos ficticios y sin conexión | P1 |
| 52 | Avisos administrativos | PARCIALMENTE IMPLEMENTADO | Crear/publicar/archivar en API | Sin UI; publicar no genera notificaciones; destinatario no validado | P1 |
| 53 | Generación automática de notificaciones | NO IMPLEMENTADO | Solo timer de vencimientos en `index.ts` | No crea `Notification` | P1 |
| 54 | Envío de correo | NO IMPLEMENTADO | Sin dependencia ni variables de correo | No hay canal email | P2 |
| 55 | Preferencias aplicadas a envíos | NO IMPLEMENTADO | API de preferencias sin consumidor | Nada filtra por preferencia | P2 |
| 56 | Idempotencia y log de envíos | NO IMPLEMENTADO | `NotificationLog` sin escrituras | Riesgo de duplicados al implementar | P2 |
| 57 | Consulta/pantalla de auditoría | NO IMPLEMENTADO | No hay ruta ni página de AuditLog | Eventos no revisables | P1 |
| 58 | Filtro de audiencia de avisos | FALLIDO | `getAnnouncements` filtra solo `gymId/status` | Avisos específicos visibles para todos y expirados | P0 |
| 59 | Framework de tests unitarios | NO IMPLEMENTADO | Sin Jest/Vitest; sin script `test` | Cobertura limitada a scripts | P2 |
| 60 | CI/CD | NO IMPLEMENTADO | Sin `.github/workflows` | Sin bloqueo de despliegue por errores | P2 |
| 61 | Despliegue real | NO IMPLEMENTADO | `server/Dockerfile` placeholder; sin evidencia de deploy | Solo preparación local | P2 |
| 62 | Backups | PARCIALMENTE IMPLEMENTADO | README sección Backups | Sin configuración ni restauración probada | P2 |
| 63 | Pruebas de carga | NO IMPLEMENTADO | Sin k6/autocannon | Capacidad no medida | P3 |

---

## D. Tabla de pruebas

| Prueba | Resultado | Evidencia | Error o limitación |
| --- | --- | --- | --- |
| `npm run typecheck` | OK | shared/server/client sin errores (EXIT=0) | — |
| `npm run build` | OK | Vite: `index-*.js` 511,54 kB / 160,34 kB gzip; `tsc` server | Advertencia de chunk >500 kB (no bloqueante) |
| `npx prisma validate` | OK | "schema is valid" | — |
| `npx prisma migrate status` | OK | 12 migraciones, "Database schema is up to date" | Solo entorno local |
| `npm audit --omit=dev` | 3 altas | `deepmerge-ts` vía Prisma CLI | Requiere Prisma 7 (breaking); no afecta al runtime de la API |
| Endpoints sin sesión | OK | `dashboard=401`, `members=401` | `GET /api/v1/gyms` responde 501 sin auth |
| Exportación solicitada como XLSX | FALLIDO | `Content-Type: application/json`, sin `Content-Disposition` | No genera archivo |
| `verify-gym-admin` | 12 checks OK | Ejecutada en esta sesión sobre el código actual | — |
| `verify-members` | 16 checks OK | idem | — |
| `verify-financials` | 16 checks OK | idem; incluye recibo PDF y anulaciones | — |
| `verify-attendance` | 13 OK, 1 skipped | idem | Cámara física no disponible |
| `verify-routines` | 13 OK, 1 skipped | idem | — |
| `verify-member-portal` | 14 checks OK | idem | — |
| `verify-performance` | OK | 7 endpoints, medianas 6–25 ms; consistencia con DB | Sin volumen representativo |
| Aislamiento cross-gym | OK | Suites rechazan acceso con 404/403 | No se probó concurrencia multi-tenant bajo carga |
| i18n en UI | FALLIDO | `grep useTranslation client/src` → 0 | Requisito de traducción no cumplido |
| Auditoría consultable | NO VERIFICABLE | No existe endpoint | Función ausente |

> Las suites de integración se ejecutaron en esta misma sesión sobre el código auditado; entre su ejecución y esta fase solo se añadieron archivos de documentación. No se volvieron a ejecutar para no escribir fixtures de prueba durante la auditoría de solo lectura.

---

## E. Hallazgos de seguridad

| Hallazgo | Gravedad | Evidencia | Impacto | Recomendación |
| --- | --- | --- | --- | --- |
| Avisos sin filtro de audiencia | **Alta** | `notification.controller.ts:getAnnouncements` filtra `{gymId,status:'PUBLISHED'}` | Un socio ve avisos dirigidos a otro socio/instructor y avisos expirados | Filtrar por `audience`, `targetUserId`, `expiresAt`; validar target en el mismo gimnasio |
| Exportación sin control de formato | Media | Endpoint devuelve JSON con `format=xlsx` | Confusión de datos, no exposición | Implementar PDF/XLSX real con permisos de sesión |
| Logout sin revocación de JWT | Media | `auth.routes.ts` solo `clearCookie` | Token robado sigue válido hasta 1 día | Añadir versión de sesión/denylist o tokens cortos + refresh |
| `GET /api/v1/gyms` público con 501 | Baja | `gyms.routes.ts` | Enumeración mínima de módulo; sin datos | Eliminar la ruta o protegerla |
| Rate limit en memoria | Baja | `express-rate-limit` por defecto | No se comparte entre instancias | Store compartido en despliegue multi-instancia |
| Auditoría no consultable | Media (control) | Sin ruta de lectura | No se pueden investigar incidentes desde la app | Endpoint scoped por gimnasio + superadmin |
| Dependencia con CVE alta (build) | Baja | `npm audit`: `deepmerge-ts` | Solo tooling de Prisma, no runtime | Planificar upgrade a Prisma 7 |
| Aislamiento multi-tenant | Sin hallazgos | Suites cross-gym 404/403; `gymId` desde sesión | — | Mantener pruebas negativas |

No se encontraron vulnerabilidades IDOR explotables en socios, membresías, pagos, asistencias, rutinas, configuración ni reportes en las rutas revisadas.

---

## F. Lista priorizada de correcciones

### P0 — Crítica

1. **Filtrar avisos por audiencia y expiración** — Notificaciones.
   - Archivos: `server/src/controllers/notification.controller.ts`.
   - Esperado: cada usuario solo ve avisos `ALL`/de su rol/o dirigidos a él, no expirados.
   - Depende de: validación de `targetUserId` en el mismo gimnasio.

### P1 — Alta

2. **Aplicar i18n en toda la interfaz** — Configuración/idioma.
   - Archivos: `client/src/**` (45 páginas), `client/src/i18n/*`.
   - Esperado: `useTranslation` en menús, formularios, errores, tablas y portal; sin claves visibles.
   - Depende de: ampliar los locales (hoy 63 líneas).
3. **Selector de idioma personal y por gimnasio** — Configuración.
   - Archivos: `GymSettingsPage.tsx`, `Topbar.tsx`, `user.controller.ts`, `gym.controller.ts`.
   - Esperado: prioridad personal > gimnasio > español, persistida.
4. **Exportación PDF/XLSX real** — Reportes.
   - Archivos: `report-members.controller.ts`, `reports.routes.ts`.
   - Esperado: archivo con `Content-Type` y `Content-Disposition` correctos, filtros aplicados.
5. **Enlazar Reportes y usar métricas en el landing** — Dashboard.
   - Archivos: `navigation.ts`, `GymReportsPage.tsx`, `GymDashboardPage.tsx`.
   - Esperado: `/gym/reports` accesible; `/gym` con `/dashboard/overview`.
6. **Panel de auditoría** — Seguridad.
   - Archivos: nuevo `audit.routes.ts`/controlador + página.
   - Esperado: listado paginado con filtros, scoped por gimnasio; superadmin global.
7. **Notificaciones automáticas y avisos** — Notificaciones.
   - Archivos: `notification.controller.ts`, nuevo scheduler.
   - Esperado: avisos publicados generan notificaciones idempotentes; vencimientos programados.
8. **Invitación al portal desde el detalle del socio** — Portal.
   - Archivos: `GymMemberDetailPage.tsx`.
   - Esperado: botón que llama `POST /members/:id/portal-access` y muestra el enlace.

### P2 — Media

9. Recuperación de contraseña por token — Autenticación.
10. Revocación de sesión/refresh — Autenticación.
11. Correo transaccional y `NotificationLog` — Notificaciones (bloqueado sin proveedor).
12. Zona horaria del gimnasio en dashboard y reportes — Reportes.
13. Formatos regionales con `Intl` — i18n.
14. Configurar S3 y verificar logo/fotos — Almacenamiento.
15. Framework de tests (Vitest/Supertest) y script `test` — Calidad.
16. CI con typecheck/build/tests — Despliegue.
17. Dockerfile real o eliminarlo — Despliegue.
18. Backups configurados y restauración probada — Operaciones.
19. Unificar cálculo financiero duplicado — Finanzas.
20. Reemplazar campana ficticia por API real — UI.

### P3 — Baja

21. Eliminar páginas muertas (`DashboardPage`, `AnalyticsPage`, `MembersPage`, `PlansPage`, `SettingsPage`) o integrarlas.
22. Retirar/proteger `gyms.routes.ts` (501).
23. Usar o eliminar `middlewares/validate.ts`.
24. Documentar campos `Gym.language/locale` y su uso futuro.
25. Actualizar Prisma por CVE de tooling.
26. Añadir lint/format.

---

## G. Decisión sobre el siguiente paso

### OPCIÓN B — CORREGIR ANTES DE CONTINUAR

**Justificación:** el núcleo transaccional y el aislamiento multi-tenant están verificados (84 comprobaciones, 401/403/404 correctos, build limpio), por lo que el proyecto es una base válida para el Prompt 20. Sin embargo, hay requisitos de prompts anteriores que **no están operativos**: i18n sin aplicar, notificaciones sin automatización ni correo, auditoría sin consulta, exportaciones que no generan archivos y navegación de reportes oculta. Además existe un hallazgo de privacidad **P0** en los avisos. Avanzar sin corregir P0/P1 acumularía deuda funcional y de seguridad sobre módulos que se declararían terminados sin estarlo.

No se modificó código, esquema, configuración ni datos durante esta auditoría. Quedo a la espera de autorización explícita para iniciar las correcciones.
