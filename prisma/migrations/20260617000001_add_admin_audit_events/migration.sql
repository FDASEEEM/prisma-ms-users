-- AlterEnum
BEGIN;
ALTER TYPE "users"."TipoEventoUsuario" ADD VALUE 'admin_create';
ALTER TYPE "users"."TipoEventoUsuario" ADD VALUE 'admin_update';
ALTER TYPE "users"."TipoEventoUsuario" ADD VALUE 'admin_deactivate';
ALTER TYPE "users"."TipoEventoUsuario" ADD VALUE 'admin_reactivate';
ALTER TYPE "users"."TipoEventoUsuario" ADD VALUE 'admin_password_reset';
COMMIT;
