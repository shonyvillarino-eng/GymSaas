\# GymFlow · Multi-Tenant Gym Management SaaS

A production-ready SaaS platform for managing gyms, membership plans, instructor
assignments and workout routines. Built with a multi-tenant architecture where
each gym owns an isolated data set.

> **Stage: Initial architecture and technical configuration.**
> Functional modules (auth flows, members CRUD, billing, analytics, PDF/Excel
> exports, etc.) are intentionally left for subsequent stages.

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

---

## Multi-Tenancy & Roles

Designed model (schema is in place, enforcement lands with the auth stage):

- Every tenant-scoped row carries a `gymId`.
- Roles: `SUPER_ADMIN`, `GYM_ADMIN`, `INSTRUCTOR`, `MEMBER`.
- Exactly one active `GYM_ADMIN` per gym; multiple instructors and members.
- No online payments — billing records are administrative only.

---

## Roadmap / Next Stages

- [ ] Auth: JWT + HttpOnly cookies, login/logout, role-based access control
- [ ] Tenancy middleware (gym-scoped queries, `gymId` isolation)
- [ ] Members & membership plans CRUD
- [ ] Instructors ↔ members assignment
- [ ] Routines & exercise completion tracking
- [ ] Dashboards, stats cards and Recharts analytics
- [ ] PDF / Excel report generation
- [ ] Administrative billing records
- [ ] Notifications & audit logging
- [ ] Deployment (Docker, CI/CD)

---

## License

Private — All rights reserved.