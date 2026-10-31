\# GymFlow · Multi-Tenant Gym Management SaaS

A production-ready SaaS platform for managing gyms, membership plans, instructor
assignments and workout routines. Built with a multi-tenant architecture where
each gym owns an isolated data set.

> **Stage: Feature complete** - All core modules implemented and integrated.

---

## Tech Stack

| Layer       | Technology                                             |
|-------------|--------------------------------------------------------|
| Frontend    | React 19 + TypeScript + Vite                           |
| Styling     | Tailwind CSS 3 (design tokens, dark mode)              |
| Forms       | React Hook Form + Zod resolvers                        |
| Charts      | Recharts                                               |
| Icons       | Lucide React                                           |
| Backend     | Node.js 20+ + Express 5 + TypeScript                   |
| Database    | PostgreSQL                                             |
| ORM         | Prisma 6                                               |
| Validation  | Zod (shared between client & server)                   |
| Auth        | JWT via `HttpOnly` cookies (scaffolded for next stage) |
| Monorepo    | npm workspaces (`client`, `server`, `shared`)          |

---

## Project Structure

```
/gym-saas
├── /client          # React SPA (Vite, Tailwind, pages, components, services)
├── /server          # Express API (routes, middlewares, controllers, Prisma)
├── /shared          # Shared TypeScript types & Zod schemas
├── README.md
└── .gitignore
```

Conventions enforced:

- REST API versioned under `/api/v1`.
- Controllers, middlewares, validation and data access live under `server/src/`.
- Pages and reusable components live under `client/src/pages/` and `client/src/components/`.
- Sensitive config (DB URL, JWT secret) comes exclusively from environment variables.
- Centralized, typed error handling via `errorHandler` + `AppError`.

---

## Prerequisites

- **Node.js ≥ 20** (tested on Node 24)
- **npm ≥ 10**
- **PostgreSQL ≥ 14** running locally or remotely (Docker works too)

---

## Installation

```bash
# 1. Clone and enter the project
cd gym-saas

# 2. Install all workspace dependencies (client, server, shared)
npm install

# 3. Create the server environment file
cp server/.env.example server/.env
#    → edit server/.env with your DB URL and a strong JWT secret

# 4. Generate the Prisma client
npm run db:generate

# 5. Push the initial schema to PostgreSQL (creates tables)
npm run db:push
```

> `npm run db:migrate` is also available if you prefer creating versioned
> Prisma migrations instead of `db push`.

---

## Environment Variables

Copy `server/.env.example` → `server/.env` and fill in:

| Variable           | Description                                        | Example                                      |
|--------------------|----------------------------------------------------|----------------------------------------------|
| `DATABASE_URL`     | PostgreSQL connection string                       | `postgresql://user:pass@localhost:5432/gym_saas` |
| `PORT`             | API port                                           | `4000`                                       |
| `NODE_ENV`         | `development` \| `test` \| `production`            | `development`                                |
| `CORS_ORIGIN`      | Allowed frontend origin(s), comma separated        | `http://localhost:5173`                      |
| `JWT_SECRET`       | Secret for signing JWTs (**≥ 32 chars**)           | `openssl rand -hex 64`                       |
| `JWT_EXPIRES_IN`   | JWT lifetime                                       | `1d`                                         |
| `JWT_COOKIE_NAME`  | HttpOnly cookie name                               | `gym_saas_token`                             |
| `JWT_COOKIE_SECURE`| `true` in production (HTTPS), `false` locally      | `false`                                      |
| `S3_ENDPOINT`      | Optional S3-compatible endpoint URL                 | provider endpoint                            |
| `S3_REGION`        | S3 region (defaults to `auto`)                      | `auto`                                       |
| `S3_BUCKET`        | Bucket used for gym logos                           | `gym-assets`                                 |
| `S3_ACCESS_KEY_ID` | Server-only object storage access key               | provider credential                          |
| `S3_SECRET_ACCESS_KEY` | Server-only object storage secret                | provider credential                          |
| `S3_PUBLIC_BASE_URL` | Public base URL serving uploaded objects          | `https://assets.example.com`                 |

The client reads `VITE_API_TARGET` (optional) to point the dev proxy at a
non-default API URL.

---

## Running the Project

### Development

```bash
# Terminal 1 — API (http://localhost:4000)
npm run dev:server

# Terminal 2 — Frontend (http://localhost:5173)
npm run dev:client
```

Or run both concurrently:

```bash
npm run dev
```

### Production build

```bash
npm run build        # builds shared → server → client
npm run typecheck    # type-checks all workspaces
npm start            # runs the compiled server (server/dist/index.js)
```

Serve the built client (`client/dist/`) with any static host, or add an
`express.static` middleware in a later stage.

---

## Useful Scripts

| Command                  | Description                                          |
|--------------------------|------------------------------------------------------|
| `npm run dev`            | Run API + frontend concurrently                      |
| `npm run dev:server`     | Run API in watch mode (tsx watch)                    |
| `npm run dev:client`     | Run Vite dev server                                  |
| `npm run build`          | Build shared, server and client for production       |
| `npm run typecheck`      | Type-check every workspace                           |
| `npm run db:generate`    | Regenerate Prisma client                             |
| `npm run db:push`        | Push Prisma schema to the database                   |
| `npm run db:migrate`     | Create/apply a Prisma migration                      |
| `npm run db:studio`      | Open Prisma Studio                                   |
| `npm start`              | Start the built server                               |

---

## API

- **Health check:** `GET http://localhost:4000/api/v1/health`
  ```json
  { "status": "ok", "service": "gym-saas-api", "version": "v1", "timestamp": "…" }
  ```
- **Base path:** `/api/v1`
- Feature routers are registered in `server/src/routes/index.ts`.
- Gym administration is under `/api/v1/gym` and is restricted to the active `GYM_ADMIN` membership of the signed-in gym. Logo uploads require the optional S3-compatible `S3_*` configuration; image bytes are stored externally, not in PostgreSQL.
  - `GET/PATCH /gym`: read/update the current gym's commercial details.
  - `GET/PUT /gym/preferences`: read/update operating preferences in the existing JSON settings document.
  - `POST /gym/logo`: upload a PNG, JPEG or WebP logo (maximum 2 MiB).
  - `GET/PATCH /gym/profile`: read/update the signed-in administrator's name and phone.
  - `PUT /gym/profile/password`: change password after validating the current password.
  - `GET /gym/instructors`: active instructors of this gym (filters and assignments).
- Member management is under `/api/v1/members`, also restricted to the active `GYM_ADMIN` of the signed-in gym. Members of other gyms always return `404`, and `SUPER_ADMIN` does **not** get implicit access to these daily operations.
  - `GET /members`: paginated list with `search`, `status`, `membership` (`ACTIVE`/`PAST_DUE`/`NONE`), `instructor` (`all`/`none`/id) and `order` by join date.
  - `POST /members`: register a member (document unique per gym; email optional).
  - `GET /members/:id` and `GET /members/:id/summary`: detail and per-tab data (memberships, payments, attendance, routines, instructor) read from the real tables — empty arrays, never fake rows.
  - `PATCH /members/:id`: edit personal data (`status` is rejected here on purpose).
  - `PATCH /members/:id/status`: `ACTIVE`/`INACTIVE`/`SUSPENDED` with an optional audited reason; historical rows are never deleted.
  - `PUT /members/:id/instructor`: set or clear the primary instructor (must belong to this gym).
  - `POST /members/:id/photo`: photograph upload to S3-compatible object storage (PNG/JPEG/WebP ≤ 2 MB).
- Administrative finance lives under `/api/v1/payments`, `/api/v1/financial-obligations` and `/api/v1/cash-registers`. Nothing is charged online: a payment is a manual record of money received elsewhere. `INSTRUCTOR` has no access, `SUPER_ADMIN` has no implicit access, and `MEMBER` gets read-only `/payments/me` and `/financial-obligations/me`.
  - `GET/POST /payments`: paginated ledger (filters: `status`, `method`, `memberId`, `from`, `to`) and registration with a server-assigned receipt number.
  - `GET /payments/:id`: payment detail including its obligation.
  - `GET /payments/:id/receipt`: PDF internal receipt (`comprobante interno`), generated on the fly and explicitly **not** a fiscal invoice.
  - `POST /payments/:id/void`: annulment that demands a reason, keeps the original movement and recalculates the balance.
  - `GET /payments/dashboard` and `GET /payments/cash-summary`: real indicators computed from valid movements minus annulments.
  - `GET/POST /financial-obligations`: receivables ledger and manual charge creation; `POST /financial-obligations/generate` turns unpaid memberships into charges idempotently.
  - `PATCH /financial-obligations/:id/cancel`: cancel an obligation, preserving it with its reason.
  - `GET/POST /cash-registers`, `GET /cash-registers/current`, `GET /cash-registers/:id`, `POST /cash-registers/:id/close`: one open session per gym (enforced by a partial unique index); the declared count is never presented as verified cash.
- Attendance lives under `/api/v1/attendance`. Both capture modes (manual and QR) run the **same** server-side policy; the QR payload only identifies a member of the signed-in gym and never authorizes anything on its own.
  - `POST /attendance/manual` and `POST /attendance/qr`: record an entry. Denied attempts return `422` with the blocking reasons; duplicates inside the configured window return `409`. An optional `exceptionReason` records an authorized administrative exception (result `EXCEPTION`, always audited).
  - `GET /attendance/eligibility?memberId=|?code=`: read-only preview of the decision, membership snapshot and last entry.
  - `GET /attendance`: paginated history with `search`, `memberId`, `from`, `to`, `method` (`MANUAL`/`QR`), `result` (`ALLOWED`/`EXCEPTION`).
  - `GET /attendance/:id` and `GET /attendance/member/:memberId`: single record and a member's history with monthly count, last visit, weekly average and an 8-week evolution.
  - `GET /attendance/stats`: reception indicators (today, 7 days, month, exceptions, method split, 14-day series, members without a membership in force).
  - `GET /attendance/members/:memberId/code` · `POST` (create/rotate) · `DELETE` (revoke): opaque per-member QR credential. Tokens are 24 random bytes, carry no personal data, and rotating invalidates the previous printed card.
  - `GET /attendance/me` and `GET /attendance/me/code`: a member's own history and credential, read-only.
  - `INSTRUCTOR` may read only the history of members currently assigned to them; `MEMBER` only their own; `SUPER_ADMIN` has no access.
- Training routines live under `/api/v1/exercises` and `/api/v1/routines`. A member only ever reads: there is no endpoint that lets them create, edit, activate or archive a routine.
  - `GET/POST /exercises`, `GET/PATCH /exercises/:id`, `PATCH /exercises/:id/status`: per-gym catalog (unique name per gym, muscle group, equipment, instructions, optional image, soft deactivation). Both `GYM_ADMIN` and `INSTRUCTOR` may maintain it; another gym's catalog is always `404`.
  - `GET/POST /routines`: paginated list (`search`, `status`, `memberId`, `instructorId`, `from`, `to`, `sort`) and creation with sessions and ordered exercises. New routines start as `DRAFT`.
  - `GET/PATCH /routines/:id`: single routine with its sessions and ordered exercises; `DELETE /routines/:id` is an alias of archiving so nothing is physically removed.
  - `GET /routines/me` (member), `GET /routines/member/:memberId` and `GET /members/:memberId/routines` (administrator or assigned instructor): a member's prescription set.
  - `POST /routines/:id/activate`: archives the member's previous active routine atomically and keeps its history; `POST /routines/:id/archive` retires a routine without deleting it.
  - `GET /routines/:id/history`: every `RoutineVersion` (number, author, reason, date, full snapshot).
  - Permissions: `GYM_ADMIN` supervises and edits any routine of its gym; `INSTRUCTOR` only writes for currently assigned members and loses write access when unassigned; `MEMBER` reads only their own; `SUPER_ADMIN` has no implicit access.
- Verification scripts (run from `server/` with the API up): `node scripts/verify-routines.mjs`, `verify-attendance.mjs`, `verify-financials.mjs`, `verify-members.mjs`, `verify-gym-admin.mjs`. They exercise the real API against PostgreSQL and remove their own fixtures afterwards.

---

## Multi-Tenancy & Roles

Designed model (schema is in place, enforcement lands with the auth stage):

- Every tenant-scoped row carries a `gymId`.
- Roles: `SUPER_ADMIN`, `GYM_ADMIN`, `INSTRUCTOR`, `MEMBER`.
- Exactly one active `GYM_ADMIN` per gym; multiple instructors and members.
- No online payments — billing records are administrative only.
- Member administrative status (`ACTIVE`/`INACTIVE`/`SUSPENDED`) is **separate** from membership state: an active member can have an expired membership.
- Attendance access is decided by the server on every check-in: by default the member must be `ACTIVE` **and** have a membership in force (started and not expired). Both requirements are configurable per gym (`attendancePolicy`), and membership validity is derived from the dates so a stale lifecycle flag cannot grant entry.
- An authorized administrator can record an entry as a justified exception; it is stored with `result = EXCEPTION`, the operator and the reason, and written to `AuditLog`. Exceptions can be disabled per gym.
- Duplicate prevention is transactional: a per-member advisory lock serializes writers, so repeated clicks, repeated scans and simultaneous requests produce exactly one entry inside the configured window.
- Members are never physically deleted: suspension/deactivation keeps payments, attendance and routines intact.
- Routines keep one active prescription per member. Activating a new one archives the previous in the same transaction and appends an immutable `RoutineVersion`, so a historical prescription is never overwritten.
- Reassigning a member to another instructor keeps the routines and their author untouched; the new instructor only gains write access if the member is actually assigned to them.

---

## Implemented Modules

- [x] **Autenticación y autorización**: JWT en cookies HttpOnly, RBAC por roles (SUPER_ADMIN, GYM_ADMIN, INSTRUCTOR, MEMBER)
- [x] **Gestión multi-tenant**: Aislamiento por gimnasio, middleware de autorización
- [x] **Superadministrador**: Panel para gestión global de gimnasios
- [x] **Administración del gimnasio**: Configuración, preferencias, logo, perfil del administrador
- [x] **Gestión de socios**: CRUD completo con validaciones, asignación a instructores, fotos
- [x] **Gestión de instructores**: Perfiles, asignación de socios
- [x] **Membresías y suscripciones**: Planes, asignación, renovación
- [x] **Pagos y obligaciones financieras**: Registro manual, anulaciones, caja, comprobantes PDF
- [x] **Asistencia**: Registro manual y por QR, políticas configurables, excepciones auditadas
- [x] **Catálogo de ejercicios y rutinas**: Creación por instructor/admin, activación, historial de versiones
- [x] **Portal del socio**: Dashboard personal, perfil, rutina activa, asistencias, membresía, pagos
- [x] **Dashboard administrativo y reportes**: Métricas en tiempo real, gráficos con Recharts, filtros temporales. La exportación PDF/Excel está pendiente: el endpoint devuelve el dataset en JSON
- [x] **Rendimiento**: bundle dividido por rutas, consultas del dashboard en paralelo, índices de ciclo de vida y diagnóstico con `X-Request-Id` (ver [docs/PERFORMANCE.md](docs/PERFORMANCE.md))
- [x] **Configuración del gimnasio**: Datos comerciales, horarios, preferencias operativas, personalización
- [x] **Internacionalización**: Español, Inglés, Portugués (i18next), preferencias por usuario/gimnasio
- [x] **Notificaciones**: Centro de notificaciones, avisos administrativos, preferencias
- [x] **Auditoría y seguridad**: Logs de auditoría, rate limiting, headers de seguridad, validación completa

---

## License

Private — All rights reserved.

---

## Despliegue en Producción

### Arquitectura recomendada
- **Frontend**: Servido como archivos estáticos (Vercel, Netlify, Cloudflare Pages). Usar `npm run build --workspace client` y servir `client/dist/`.
- **Backend**: API Node.js/Express (Render, Railway, Fly.io, DigitalOcean App Platform). Usar `npm run build --workspace server` y `npm start --workspace server`.
- **Base de datos**: PostgreSQL administrado (Neon, Supabase, Railway, Render, AWS RDS). Requiere conexión con SSL.
- **Almacenamiento**: S3-compatible (Cloudflare R2, AWS S3, Supabase Storage) para logos, fotos e imágenes.

### Variables de entorno
**Servidor (`server/.env`)**
- `NODE_ENV=production`
- `PORT` (configurado por el proveedor)
- `DATABASE_URL` (PostgreSQL con `sslmode=require`)
- `CORS_ORIGIN` (dominio del frontend, separados por coma si hay múltiples)
- `JWT_SECRET` (mínimo 32 caracteres, aleatorio)
- `JWT_EXPIRES_IN`, `JWT_COOKIE_NAME`, `JWT_COOKIE_SECURE=true`
- `S3_*` (opcionales, necesarios si se usan uploads)

**Cliente (`client/.env`)**
- `VITE_API_URL` (URL completa de la API, ej: https://api.tudominio.com). Si se sirve en mismo dominio, puede omitirse.

### Migraciones
```bash
cd server
npx prisma migrate deploy
```
Nunca usar `prisma migrate reset` en producción.

### Health checks
- `GET /health` o `GET /api/v1/health` - verifica que el servicio responde.

### Seguridad
- Usar HTTPS en todos los entornos productivos
- Cookies con `HttpOnly`, `Secure`, `SameSite` apropiado
- CORS restrictivo a orígenes conocidos
- No exponer secretos en variables `VITE_*`
- Mantener `.env` fuera del control de versiones

### Backups
Configurar backups automáticos de PostgreSQL con el proveedor. Probar restauración periódicamente. Respaldar archivos en almacenamiento externo por separado.
