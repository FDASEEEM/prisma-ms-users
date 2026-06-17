-- AlterEnum
BEGIN;
ALTER TYPE "users"."TipoEventoUsuario" ADD VALUE 'colegio_create';
ALTER TYPE "users"."TipoEventoUsuario" ADD VALUE 'colegio_update';
ALTER TYPE "users"."TipoEventoUsuario" ADD VALUE 'colegio_deactivate';
COMMIT;
