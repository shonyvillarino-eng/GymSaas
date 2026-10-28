# API (Express + TypeScript)

Base path: `/api/v1`.

## Structure

```
src/
├── config/        # env config loader (centralized, validated with Zod)
├── lib/           # reusable helpers (Prisma client singleton)
├── middlewares/   # validate, errorHandler, notFound, auth (future)
├── routes/        # feature routers mounted in routes/index.ts
└── index.ts       # server bootstrap (listen)
```

## Adding a feature

1. Create `src/routes/<feature>.routes.ts`.
2. Register it in `src/routes/index.ts`.
3. Validate request payloads with `validateBody(schema)` middleware.
4. Throw `AppError` for domain errors — the central `errorHandler` formats responses.

## Error format

```json
{ "error": "Human readable message", "details": { "field": ["issue"] } }
```

5xx messages are masked outside of development.