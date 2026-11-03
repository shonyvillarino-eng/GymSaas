Hablo en este archivo solo lo indispensable para el equipo:
- El cubo S3 usa `DATABASE_URL` y `SESSION_SECRET`.
- `server/.gitignore` excluye `.env`, `.env.local`, `.env.*.local`, `.env.loaded`.
- El directorio `.pgdata/` se genera por `prepare-embedded-postgres-directory.ts`.
- Si hay S3 en el cubo Freebuff, los archivos para restaurar deben estar listos antes de ejecutar el script de restauración.
