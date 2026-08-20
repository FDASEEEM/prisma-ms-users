const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
} = require("@aws-sdk/client-cognito-identity-provider");

function loadEnv(filePath) {
  const content = fs.readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");

    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^"|"$/g, "");
    process.env[key] = value;
  }
}

async function main() {
  const envPath = path.join(__dirname, "..", ".env");
  loadEnv(envPath);

  const email = "devmode@prisma.local";
  const password = "devmode1";
  const desiredRutCandidates = [
    "99.999.999-9",
    "98.888.888-8",
    "97.777.777-7",
    "96.666.666-6",
  ];

  const prisma = new PrismaClient();
  const cognito = new CognitoIdentityProviderClient({
    region: process.env.COGNITO_REGION || "us-east-1",
  });
  const userPoolId = process.env.COGNITO_USER_POOL_ID;

  if (!userPoolId) {
    throw new Error("COGNITO_USER_POOL_ID is required in .env");
  }

  try {
    let authSub = null;

    // Check if user already exists
    try {
      const getUserCommand = new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: email,
      });
      const result = await cognito.send(getUserCommand);
      authSub = result.UserAttributes?.find((a) => a.Name === "sub")?.Value;

      // Update password
      const setPasswordCommand = new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: email,
        Password: password,
        Permanent: true,
      });
      await cognito.send(setPasswordCommand);
    } catch (error) {
      if (error.name === "UserNotFoundException") {
        // Create user
        const createUserCommand = new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: email,
          UserAttributes: [
            { Name: "email", Value: email },
            { Name: "email_verified", Value: "true" },
          ],
          MessageAction: "SUPPRESS",
        });
        const result = await cognito.send(createUserCommand);
        authSub = result.User?.Attributes?.find((a) => a.Name === "sub")?.Value;

        // Set permanent password
        const setPasswordCommand = new AdminSetUserPasswordCommand({
          UserPoolId: userPoolId,
          Username: email,
          Password: password,
          Permanent: true,
        });
        await cognito.send(setPasswordCommand);
      } else {
        throw error;
      }
    }

    if (!authSub) {
      throw new Error("Could not get user sub from Cognito.");
    }

    let rut = desiredRutCandidates[0];
    for (const candidate of desiredRutCandidates) {
      const existing = await prisma.user.findUnique({ where: { rut: candidate } });
      if (!existing || existing.email === email) {
        rut = candidate;
        break;
      }
    }

    const profile = await prisma.user.upsert({
      where: { email },
      update: {
        supabaseUserId: authSub,
        rut,
        nombreCompleto: "Dev Mode Prisma",
        establecimiento: "PRISMA",
        phone: null,
        specialty: "Desarrollo",
        position: "DevMode",
        active: true,
        role: "ADMIN",
      },
      create: {
        supabaseUserId: authSub,
        email,
        rut,
        nombreCompleto: "Dev Mode Prisma",
        establecimiento: "PRISMA",
        phone: null,
        specialty: "Desarrollo",
        position: "DevMode",
        active: true,
        role: "ADMIN",
      },
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          email: profile.email,
          authUserId: authSub,
          profileId: profile.id,
          rut: profile.rut,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
