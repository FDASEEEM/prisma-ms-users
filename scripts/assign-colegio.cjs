/**
 * Asigna un colegio a un usuario, actualizando AMBAS fuentes:
 *  1. Postgres (tabla `usuarios.colegio_id`) -> verdad del dominio.
 *  2. Supabase `app_metadata.colegioId` -> lo que viaja en el JWT y leen
 *     perfil-alumno/docs. (server-only; el token lo toma en el proximo login).
 *
 * Uso:  node scripts/assign-colegio.cjs <email> <colegioId>
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { createClient } = require("@supabase/supabase-js");

function loadEnv(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i === -1) continue;
    process.env[trimmed.slice(0, i).trim()] = trimmed
      .slice(i + 1)
      .trim()
      .replace(/^"|"$/g, "");
  }
}

async function main() {
  const [email, colegioId] = process.argv.slice(2);
  if (!email || !colegioId) {
    console.error("Uso: node scripts/assign-colegio.cjs <email> <colegioId>");
    process.exitCode = 1;
    return;
  }

  loadEnv(path.join(__dirname, "..", ".env"));

  const prisma = new PrismaClient();
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
  );

  try {
    const colegio = await prisma.colegio.findUnique({ where: { id: colegioId } });
    if (!colegio) {
      throw new Error(`No existe un colegio con id ${colegioId} (FK colegio_id la rechazaria).`);
    }

    const user = await prisma.user.update({
      where: { email },
      data: { colegioId },
      select: { id: true, email: true, role: true, colegioId: true, supabaseUserId: true },
    });

    const appMetadata = { role: user.role, colegioId: user.colegioId };
    const result = await supabase.auth.admin.updateUserById(user.supabaseUserId, {
      app_metadata: appMetadata,
    });
    if (result.error || !result.data.user) {
      throw new Error(`Supabase: ${result.error?.message ?? "sin usuario"}`);
    }

    console.log(
      JSON.stringify(
        { ok: true, email: user.email, colegio: colegio.nombre, appMetadata },
        null,
        2,
      ),
    );
    console.log("\nEl usuario debe re-loguearse para que el nuevo token lleve el colegioId.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
