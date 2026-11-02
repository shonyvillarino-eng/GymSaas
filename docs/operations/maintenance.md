# Mantenimiento

## Rutinas recomendadas

- Revisar errores en logs.
- Verificar que `/api/v1/health` responde.
- Chequear espacio de disco.
- Revisar backups.
- Actualizar dependencias con precaución.

## Entorno de desarrollo

```bash
cd server
npm run dev
```

## Producción

- Usar un proceso manager (systemd, pm2, Docker, etc.).
- No correr con `npm run dev` en producción.
- Monitorear consumo de memoria y CPU.

## Consejos

- Mantener `server/.env` protegido.
- No commitear secretos.
- Revisar `prisma/migrations` antes de cambios de esquema.
