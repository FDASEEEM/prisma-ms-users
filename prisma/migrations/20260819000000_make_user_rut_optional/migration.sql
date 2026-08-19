-- Make "rut" optional: users authenticated via Google OAuth may not have a Chilean RUT.
ALTER TABLE "users"."usuarios" ALTER COLUMN "rut" DROP NOT NULL;