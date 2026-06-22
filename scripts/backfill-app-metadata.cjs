/**
 * Backfill de app_metadata en Supabase.
 *
 * Por que: los microservicios (perfil-alumno, docs) leen el tenant del usuario
 * desde `app_metadata.colegioId` / `app_metadata.role` del JWT. ms-users solo
 * escribia esos datos en `user_metadata` (editable por el usuario, e ignorado
 * por el guard), por lo que los tokens nunca llevaban colegioId -> 403
 * "User has no colegioId in token".
 *
 * Este script toma la verdad desde la tabla Postgres `user` y la propaga a
 * `app_metadata` (server-only) para los usuarios YA existentes. Los usuarios
 * nuevos y las reasignaciones de rol/colegio ya se sincronizan en el codigo.
 *
 * IMPORTANTE: app_metadata solo viaja en tokens nuevos. Tras correr esto, los
 * usuarios deben volver a iniciar sesion (o refrescar el token) para que el
 * 403 desaparezca.
 *
 * Uso:  node scripts/backfill-app-metadata.cjs [--dry-run]
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

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed
      .slice(equalsIndex + 1)
      .trim()
      .replace(/^"|"$/g, "");
    process.env[key] = value;
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  loadEnv(path.join(__dirname, "..", ".env"));

  const prisma = new PrismaClient();
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );

  const summary = { total: 0, updated: 0, skipped: 0, failed: 0 };

  try {
    // supabaseUserId es columna requerida (String) -> todos los usuarios tienen uno.
    const users = await prisma.user.findMany({
      select: { id: true, email: true, role: true, colegioId: true, supabaseUserId: true },
    });

    summary.total = users.length;
    console.log(`Encontrados ${users.length} usuarios con supabaseUserId.${dryRun ? " (DRY RUN)" : ""}`);

    for (const user of users) {
      const appMetadata = { role: user.role, colegioId: user.colegioId ?? null };

      if (dryRun) {
        console.log(`  [dry] ${user.email} -> ${JSON.stringify(appMetadata)}`);
        summary.skipped += 1;
        continue;
      }

      const result = await supabase.auth.admin.updateUserById(user.supabaseUserId, {
        app_metadata: appMetadata,
      });

      if (result.error || !result.data.user) {
        summary.failed += 1;
        console.error(`  [FAIL] ${user.email}: ${result.error?.message ?? "sin usuario"}`);
        continue;
      }

      summary.updated += 1;
      console.log(`  [ok]  ${user.email} -> ${JSON.stringify(appMetadata)}`);
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log("\nResumen:", JSON.stringify(summary, null, 2));
  if (!dryRun && summary.updated > 0) {
    console.log("\nRecorda: los usuarios deben re-loguearse para que el nuevo token lleve el colegioId.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
