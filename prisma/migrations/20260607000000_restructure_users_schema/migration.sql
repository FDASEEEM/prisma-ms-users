-- ============================================================
-- Baseline: prisma-ms-users -> schema "users"
-- ============================================================

CREATE SCHEMA IF NOT EXISTS "users";

-- Enums
DO $$ BEGIN
  CREATE TYPE "users"."UserRole" AS ENUM ('ADMIN', 'TEACHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "users"."TipoEventoUsuario" AS ENUM ('register', 'login', 'logout', 'refresh', 'profile_update');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "users"."ResultadoOperacion" AS ENUM ('success', 'failure');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Table: users.usuarios
CREATE TABLE IF NOT EXISTS "users"."usuarios" (
    "id" UUID NOT NULL,
    "id_supabase" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "nombre_completo" TEXT NOT NULL,
    "establecimiento" TEXT,
    "telefono" TEXT,
    "especialidad" TEXT,
    "cargo" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "rol" "users"."UserRole" NOT NULL DEFAULT 'TEACHER',

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "usuarios_id_supabase_key" ON "users"."usuarios"("id_supabase");
CREATE UNIQUE INDEX IF NOT EXISTS "usuarios_correo_key" ON "users"."usuarios"("correo");
CREATE UNIQUE INDEX IF NOT EXISTS "usuarios_rut_key" ON "users"."usuarios"("rut");

-- Table: users.logs_usuarios
CREATE TABLE IF NOT EXISTS "users"."logs_usuarios" (
    "id" UUID NOT NULL,
    "tipo_evento" "users"."TipoEventoUsuario" NOT NULL,
    "user_id" UUID,
    "ip_origen" TEXT,
    "resultado" "users"."ResultadoOperacion" NOT NULL,
    "mensaje" TEXT NOT NULL,
    "fecha_hora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_usuarios_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "users"."logs_usuarios"
  ADD CONSTRAINT "logs_usuarios_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"."usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "logs_usuarios_user_id_idx" ON "users"."logs_usuarios"("user_id");
CREATE INDEX IF NOT EXISTS "logs_usuarios_fecha_hora_idx" ON "users"."logs_usuarios"("fecha_hora");
