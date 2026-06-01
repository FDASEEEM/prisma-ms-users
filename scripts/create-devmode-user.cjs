const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { createClient } = require("@supabase/supabase-js");

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

  try {
    const { data, error } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (error) {
      throw error;
    }

    let authUser = data.users.find((user) => user.email === email) ?? null;

    if (authUser) {
      const updateResult = await supabase.auth.admin.updateUserById(authUser.id, {
        password,
        email_confirm: true,
      });

      if (updateResult.error || !updateResult.data.user) {
        throw updateResult.error ?? new Error("No se pudo actualizar el usuario en Supabase.");
      }

      authUser = updateResult.data.user;
    } else {
      const createResult = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (createResult.error || !createResult.data.user) {
        throw createResult.error ?? new Error("No se pudo crear el usuario en Supabase.");
      }

      authUser = createResult.data.user;
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
        supabaseUserId: authUser.id,
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
        supabaseUserId: authUser.id,
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
          authUserId: authUser.id,
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