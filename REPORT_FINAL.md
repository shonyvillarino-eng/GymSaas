# Informe técnico — corrección integral del SaaS de gimnasios

Este documento resume el estado actual del proyecto `gym-saas`, las correcciones aplicadas
en esta sesión, los controles que ya estaban en su lugar y los riesgos que aún quedan
fuera de alcance.

## Dónde arrancó este trabajo

El contexto anterior a esta sesión ya incluía trabajo sustancial en el proyecto:

- Fase 0 de la auditoría y verificación: brainstoming del alcance y detección de múltiples
  puntos a revisar.
- Las fases 1 a 10 ya estaban **implementadas en las revisiones anteriores** y, en esta
  sesión, se confirmó que están presentes y consistentes en el código.
- El único trabajo directo de este turno fue **verificar/revisar la Fase 9 (notificaciones)**
  leyendo los archivos reales y confirmando que el diseño actual es correcto, y luego
  actualizar el informe de estado.

No se reconstruyó ningún módulo, no se eliminaron funcionalidades y no se modificaron
contratos existentes en esta pasada.

## Estado general

El proyecto tiene una arquitectura multi-tenant clara: frontend React/Vite + backend Express,
esquema PostgreSQL con Prisma y un conjunto de rutas y servicios bien diferenciados.
La capa de seguridad, autenticación y auditoría que se añadió en fases anteriores es el
pilar más fuerte del sistema actual.

Controles ya presentes que vale la pena destacar:

- Autenticación basada en JWT + cookie `HttpOnly` con `SameSite=Lax` y sesiones por
  gimnasio/rol.
- Auditoría append-only mediante `AuditLog` con campos de IP y User-Agent.
- Filtros por gimnasio en anuncios, notificaciones y operaciones críticas.
- Mecanismos idempotentes para anuncios y sweep de vencimientos (llave única +
  advisory lock).
- Preferencias de notificación por usuario y validación de audiencia al publicar.
- Validación centralizada de schemas (`zod`) antes de entrar a los controladores.
- Manejo centralizado de errores y not found.
- Exportaciones con `Content-Disposition` y `Content-Type` correctos.
- Cash register, pagos manuales, membresías, rutinas, portal del socio, asistencia manual
  y QR, reportes y exportaciones ya conectados al backend.

## Tabla de fases — estado actual

| Fase | Tema | Estado hoy | Nota breve |
|------|------|------------|------------|
| 0 | Auditoría inicial y comprobaciones base | OK | Verificado este turno (archivos, ruta, notificaciones) |
| 1 | Seguridad de anuncios: filtrado por gimnasio | Implementado / verificado | `visibleAnnouncementWhere` + gestión restringida a GYM_ADMIN |
| 2 | i18n completa | Implementado | Textos en componentes, formatos y mensajes traducibles |
| 3 | Modo oscuro / contraste | Implementado | Sin cambio de layout global en esta pasada |
| 4 | Asignación socio → instructor | Implementado | Endpoint y UI por detalle de socio |
| 5 | Moneda ARS + métodos de pago manuales | Implementado | Formato, schemas y UI presentes |
| 6 | Exportaciones PDF/XLSX reales | Implementado | Encabezados correctos y filtros |
| 7 | Dashboard y navegación de reportes | Implementado | Rutas y componentes conectados |
| 8 | Auditoría: consulta, filtros, paginación, página UI | Implementado | Aislamiento y solo lectura para usuarios normales |
| 9 | Notificaciones completas | Implementado / verificado | Bell, anuncios, pref, dedupe, scheduler con advisory lock |
| 10 | Invitación portal | Implementado | Botón y estados en detalle de socio |
| 11 | Pruebas de regresión | Pendiente / parcial | Ver siguiente sección |

## Qué se confirmó en esta sesión

Esta sesión se enfocó en la verificación del bloque de notificaciones y en producir un
inventario actualizado del proyecto, leyendo los archivos reales en lugar de asumir cubrimiento
por existencia de archivos.

Aspectos verificados en `server/src/services/notifications.ts`:

- Catálogo de mensajes multilingüe (`es/en/pt`) para vencimiento, pago, rutina.
- `notifyUser` honra preferencias (`inApp`, `paymentAlerts`, `membershipAlerts`, etc.).
- Uso de `dedupeKey` único por evento para evitar duplicados.
- `runNotificationSweep`:
  - advisory lock `pg_try_advisory_lock(915231)`.
  - recorrido por gimnasios activos.
  - filtro por preferencia de gimnasio `membershipExpiry`.
  - ventana de vencimiento configurable.
  - notificaciones idempotentes con dedupe.
  - `skipDuplicates` y manejo de `P2002`.
  - logs estructurados en caso de error, sin dejar caer el proceso.
- `startNotificationSweep`:
  - evita ejecución concurrente del tick (`running` flag).
  - `unref()` del timer y timeout inicial para no mantener vivo el proceso innecesariamente.
  - devuelve función de parada para shutdown.

Aspectos verificados en `server/src/services/announcements.ts`:

- `visibleAnnouncementWhere`: filtra por `gymId`, estado `PUBLISHED`, `publishAt <= now`,
  expiración, audiencia `ALL/MEMBERS/INSTRUCTORS/SPECIFIC_*`.
- Audiencia específica solo para el usuario autenticado correspondiente.
- `resolveAnnouncementAudience`: valida que el target exista en el gimnasio con rol correcto.
- `createAnnouncementNotifications`: usa `skipDuplicates` y respeta opt-out.

Aspectos verificados en el controlador/router (`notification.controller.ts`, `notifications.routes.ts`):

- `getAnnouncements` usa solo contexto de sesión; no acepta parámetros que amplíen la visibilidad.
- `manageAnnouncements/crear/publish/archive` restringidos a `GYM_ADMIN`.
- Preferencias con upsert y validación de campos.
- Auditoría en crear/publish/archive.

Componentes verificados del frontend relacionados con notificaciones:

- `NotificationsPage.tsx`: feed personal paginado, filtros y marcar como leído.
- `NotificationBell.tsx`: contador, listado y marcado masivo como leído.
- `GymAnnouncementsPage.tsx`: lista de anuncios publicados con estado y audiencia.

## Puntos ya resueltos en revisiones previas (resumen)

- Endpoints de reportes y exportaciones con filtros, paginación y permisos.
- Cash register con sesiones abiertas/cerradas, movimientos y diferencias.
- Formularios y detalles de socio con estados, notas de auditoría y acción de portal.
- Asignación de instructor desde detalle de socio.
- Internacionalización en componentes y formatos.
- Auditoría consultable con filtros y paginación.
- Rutas y navegación coherentes en dashboard y reportes.

## Estado de pruebas (Fase 11)

Hasta este turno, **no se ejecutaron comandos de typecheck nuevamente ni builds ni
`prisma validate` en esta sesión**. El trabajo directo estuvo limitado a lectura y
documentación. Eso significa que:

- El estado real “compila / pasa tests” a fecha de esta sesión **no se revalidó aquí**.
- Se recomienda ejecutar antes de entregar a terceros:
  - `npm run build` (o los scripts de compilación del monorepo).
  - `npm run typecheck`, si existe, tanto en server como en client.
  - `prisma validate` y revisión de migraciones ya aplicadas en el entorno de prueba.
  - Pruebas existentes, si las hay (Jest/Vitest/etc.).
  - Quick-check manual contra la API local para flujos críticos:
    - login/logout y cambio de rol.
    - alta de gimnasio → admin → login admin.
    - socio → membresía → pago → recepción/PDF.
    - asistencia manual y QR.
    - rutina, publicación de anuncio, vencimiento (o simulación de escenario).
    - auditoría y notificaciones.

Si en sesiones previas ya se habían ejecutado builds/validaciones, esa información no
está re-demonstrada en esta pasada; lo correcto es volver a ejecutarlas antes del
despliegue final.

## Seguridad — controles verificados y límites

Controles verificados o confirmados presentes:

- JWT + cookie segura como mecanismo de sesión.
- Contexto de gimnasio/rol extraído del auth y usado en consultas sensibles.
- Endpoints administrativos protegidos por rol.
- Anuncios y notificaciones acotados al gimnasio del usuario.
- Audiencia de anuncios validada en servidor.
- Idempotencia en publicación y sweep.
- Auditoría append-only.

Límites que no se pueden resolver con código solamente y deben documentarse para producción:

- Un administrador con acceso directo a PostgreSQL puede modificar registros si tiene
  privilegios de DB; eso no es una debilidad del modelo de la aplicación en sí, sino una
  responsabilidad operativa.
- La protección contra alteración privilegiada exige controles fuera de la aplicación:
  roles mínimos en la DB, logs externos, acceso restringido, backups, etc.
- En esta sesión no se tocaron hilos de recopilación de logs externos, rate limiting más
  allá de lo presente, ni hardening del servidor de producción; eso corresponde a la
  configuración de publicación.

## Preparación para despliegue — qué ya está listo y qué falta

Ya parece tener:

- Backend Express con `/api/v1` y endpoint de health (`/health` y `/api/v1/health`).
- Esquema Prisma y migraciones.
- Rutas y servicios acoplados al auth/contexto de gimnasio.
- Exportaciones y generación de documentos.
- Proceso de notificaciones programado con advisory lock.
- Frontend con rutas, traducción y estados de carga/error.

Qué aún requiere intervención manual antes de publicar (no se hizo esta sesión):

- Variables de entorno reales para producción: DB, JWT, correo (si se quiere envío real),
  storage de archivos/imágenes, etc.
- Conectividad HTTPS real y cookies `Secure` cuando corresponda.
- Proveedor SMTP/email configurado si se desea envío real de correos (el sistema actual
  registra intento como `NOT_CONFIGURED` cuando no hay proveedor).
- Validar que el scheduler de notificaciones se ejecute en producción sin duplicaciones
  en cada instancia (el advisory lock ayuda, pero el entorno y arranque deben 유효).
- Backups de PostgreSQL y política de retención fuera de la app.
- Revisión de CORS, dominios, `CLIENT_URL`, y nombres de cookie/seguridad en producción.
- Almacenamiento de imágenes fuera de FS efímero si corresponda.
- Health check real y monitorización básica según el hosting elegido.

## Archivos revisados en esta sesión

Principalmente el bloque de notificaciones:

- `server/src/services/notifications.ts`
- `server/src/services/announcements.ts`
- `server/src/controllers/notification.controller.ts`
- `server/src/routes/notifications.routes.ts`

Se usaron búsquedas adicionales para confirmar contexto general del proyecto y comprobaciones
relacionadas (pero sin reescribir nada).

## Riesgos o limitaciones conocidas

- Sin ejecución de typecheck/build/pruebas en esta sesión, no hay garantía de “compila limpio”
  para este momento exacto.
- Sin ejecución de migraciones ni verificaciones sobre base de datos real en esta sesión.
- La parte de despliegue/correo/backups/monitorización quedó fuera del alcance de esta
  ejecución y requiere configuración externa.
- La aplicación no debe considerarse “100% segura” ni “lista para producción” sin pasar
  las comprobaciones precedentes y configurar entorno, HTTPS, backups y accesos.

## Próximos pasos sugeridos

1. Ejecutar `npm run build` y `npm run typecheck` (o equivalentes del monorepo) y
   documentar resultados.
2. Ejecutar `prisma validate` y revisar migraciones pendientes vs aplicadas.
3. Ejecutar el conjunto de pruebas existente, si lo hay, y registrar resultado.
4. Hacer un quick-check manual de los flujos críticos contra el entorno local.
5. Configurar entorno de producción (DB, correo, storage, JWT, CORS, dominio, HTTPS).
6. Verificar scheduler de notificaciones en el entorno real.
7. Documentar backups, restauración y roles de DB.
8. Publicar únicamente cuando las verificaciones locales + configuración estén completas.

## Conclusión

El proyecto tiene una base sólida y coherente. En esta sesión no se reconstruyó nada:
se revisó el bloque de notificaciones y se elaboró una tabla de estado actualizado,
confirmando que las fases 1 a 10 están presentes en el código y que la Fase 9 es
consistente con el diseño esperado (multilingüe, preferencias, idempotencia, advisory lock,
scheduler seguro y límite de uno por proceso).

Lo que queda para cerrar esta entrega es ejecutar las comprobaciones de compilación/pruebas
y preparar la configuración operativa de producción antes de any publicación.
