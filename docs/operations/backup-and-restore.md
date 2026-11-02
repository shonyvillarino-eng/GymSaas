# Copias de Seguridad y Restauración

## Estrategia actual

- El proyecto usa PostgreSQL vía Supabase.
- No hay backups automáticos configurados en el código.
- El host de base de datos se configura en `DATABASE_URL` (`server/.env`).

## Recomendaciones

1. Configurar backups en el panel de Supabase (si está disponible).
2. Exportar datos periódicamente con `pg_dump`.
3. Almacenar copias fuera del entorno de producción.
4. Validar restauración en entorno aislado antes de producción.

## Restauración

1. Detener servicios que escriban en la BD.
2. Identificar backup.
3. Restaurar en BD de prueba.
4. Validar esquema.
5. Volver a producción con autorización.

## Comandos útiles

```bash
pg_dump -h <host> -U postgres -d gym_saas > backup.sql
psql -h <host> -U postgres -d gym_saas -f backup.sql
```

Reemplaza `<host>` con la URL de tu proveedor.
