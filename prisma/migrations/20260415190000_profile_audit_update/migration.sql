-- Rename and consolidate profile fields
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "nombre_completo" TEXT;
UPDATE "usuarios"
SET "nombre_completo" = TRIM(CONCAT_WS(' ', "nombres", "apellidos"))
WHERE "nombre_completo" IS NULL;
ALTER TABLE "usuarios" ALTER COLUMN "nombre_completo" SET NOT NULL;

ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "establecimiento" TEXT;

ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "nombres";
ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "apellidos";

-- Create audit enums
DO $$
BEGIN
    CREATE TYPE "TipoEventoUsuario" AS ENUM ('register', 'login', 'logout', 'refresh', 'profile_update');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE "ResultadoOperacion" AS ENUM ('success', 'failure');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Create audit table
CREATE TABLE IF NOT EXISTS "logs_usuarios" (
    "id" UUID NOT NULL,
    "tipo_evento" "TipoEventoUsuario" NOT NULL,
    "user_id" UUID,
    "ip_origen" TEXT,
    "resultado" "ResultadoOperacion" NOT NULL,
    "mensaje" TEXT NOT NULL,
    "fecha_hora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_usuarios_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    ALTER TABLE "logs_usuarios"
    ADD CONSTRAINT "logs_usuarios_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "logs_usuarios_user_id_idx" ON "logs_usuarios"("user_id");
CREATE INDEX IF NOT EXISTS "logs_usuarios_fecha_hora_idx" ON "logs_usuarios"("fecha_hora");
