# Client (React + Vite + Tailwind)

## Structure

```
src/
├── components/
│   ├── layout/     # AppLayout, Sidebar, Topbar
│   └── ui/         # Button, Input, DataTable, StatCard, states (loading/error/empty/success)
├── lib/            # api client, theme, navigation, utils (cn)
├── pages/          # route-level pages
├── styles/         # index.css (Tailwind entry + design tokens)
├── App.tsx         # route table
└── main.tsx        # bootstrap
```

## Conventions

- All API calls go through `lib/api.ts` (`api<T>()`), never raw `fetch` in components.
- Reusable Zod schemas and enums are imported from `@shared`.
- Tailwind design tokens: `surface-card`, `btn-primary`, `btn-outline`, `input`, `label`.
- Every async surface must handle loading, error, empty and success states —
  use the components in `components/ui/states.tsx`.
- Dark mode is class-based (`.dark` on `<html>`), persisted in `localStorage`.

## Dev proxies

Vite proxies `/api` → `http://localhost:4000` (override with `VITE_API_TARGET`).