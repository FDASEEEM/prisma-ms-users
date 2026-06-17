BEGIN;

ALTER TYPE "users"."UserRole" ADD VALUE 'SUPERADMIN';

CREATE TABLE IF NOT EXISTS "users"."colegios" (
    "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre"          TEXT NOT NULL,
    "direccion"       TEXT NOT NULL,
    "telefono"        TEXT,
    "email"           TEXT NOT NULL,
    "rut"             TEXT NOT NULL,
    "plan"            TEXT NOT NULL DEFAULT 'basic',
    "fecha_inicio"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_termino"   TIMESTAMP(3),
    "activo"          BOOLEAN NOT NULL DEFAULT true,
    "creado_en"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "colegios_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "colegios_email_key" ON "users"."colegios"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "colegios_rut_key" ON "users"."colegios"("rut");

ALTER TABLE "users"."usuarios"
    ADD COLUMN IF NOT EXISTS "colegio_id" UUID;

ALTER TABLE "users"."usuarios"
    ADD CONSTRAINT "usuarios_colegio_id_fkey"
    FOREIGN KEY ("colegio_id") REFERENCES "users"."colegios"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "usuarios_colegio_id_idx" ON "users"."usuarios"("colegio_id");

COMMIT;
