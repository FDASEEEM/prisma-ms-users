/**
 * Backfill de custom attributes en Cognito.
 *
 * Por que: los microservicios (perfil-alumno, docs) leen el tenant del usuario
 * desde los custom attributes (custom:role, custom:colegioId) del JWT, o desde
 * la tabla Postgres.
 *
 * Este script toma la verdad desde la tabla Postgres `user` y la propaga a
 * los custom attributes de Cognito para los usuarios YA existentes.
 *
 * IMPORTANTE: Los custom attributes solo viajan en tokens nuevos si se
 * configura un Pre Token Generation Lambda trigger. Sin ese trigger,
 * los microservicios deben leer role/colegioId desde Postgres.
 *
 * Uso:  node scripts/backfill-app-metadata.cjs [--dry-run]
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
} = require("@aws-sdk/client-cognito-identity-provider");

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
  const cognito = new CognitoIdentityProviderClient({
    region: process.env.COGNITO_REGION || "us-east-1",
  });
  const userPoolId = process.env.COGNITO_USER_POOL_ID;

  if (!userPoolId) {
    throw new Error("COGNITO_USER_POOL_ID is required in .env");
  }

  const summary = { total: 0, updated: 0, skipped: 0, failed: 0 };

  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, role: true, colegioId: true, supabaseUserId: true },
    });

    summary.total = users.length;
    console.log(`Encontrados ${users.length} usuarios con supabaseUserId.${dryRun ? " (DRY RUN)" : ""}`);

    for (const user of users) {
      const attributes = [
        { Name: "custom:role", Value: user.role },
        { Name: "custom:colegioId", Value: user.colegioId || "" },
      ];

      if (dryRun) {
        console.log(`  [dry] ${user.email} -> ${JSON.stringify({ role: user.role, colegioId: user.colegioId })}`);
        summary.skipped += 1;
        continue;
      }

      try {
        // Resolve username from supabaseUserId (which is the Cognito sub)
        const getUserCommand = new AdminGetUserCommand({
          UserPoolId: userPoolId,
          Username: user.supabaseUserId,
        });
        const cognitoUser = await cognito.send(getUserCommand);

        const updateCommand = new AdminUpdateUserAttributesCommand({
          UserPoolId: userPoolId,
          Username: cognitoUser.Username!,
          UserAttributes: attributes,
        });
        await cognito.send(updateCommand);

        summary.updated += 1;
        console.log(`  [ok]  ${user.email} -> ${JSON.stringify({ role: user.role, colegioId: user.colegioId })}`);
      } catch (error) {
        summary.failed += 1;
        console.error(`  [FAIL] ${user.email}: ${error.message ?? "sin usuario"}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log("\nResumen:", JSON.stringify(summary, null, 2));
  if (!dryRun && summary.updated > 0) {
    console.log("\nRecorda: los usuarios deben re-loguearse para que el nuevo token lleve los attributes actualizados (si se configura Pre Token Generation Lambda).");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
