# CLAUDE.md — prisma-ms-users

> Contexto interno para sesiones de Claude Code trabajando en este repo. Para el mapa completo del
> sistema P.R.I.S.M.A. (los demás repos, flujos end-to-end) ver el `CLAUDE.md` en la raíz del workspace
> `EP2/`. Este archivo describe **solo** `prisma-ms-users`.

---

## 1. Rol dentro de P.R.I.S.M.A.

`prisma-ms-users` es el **dueño de la identidad** del sistema. Es el único microservicio que:

- Tiene `SUPABASE_SERVICE_ROLE_KEY` (`src/infrastructure/supabase/supabase.service.ts`) → puede crear,
  actualizar, eliminar y resetear contraseñas de usuarios en **Supabase Auth**.
- Persiste el **perfil docente extendido** en PostgreSQL (`schema "users"`, tabla `usuarios`).
- Escribe **auditoría** de eventos de identidad en `logs_usuarios`.
- Escribe `app_metadata` (server-only) en Supabase con `role` y `colegioId` — es la fuente de verdad del
  **tenant** que leen `ms-docs` y `ms-perfil-alumno` al validar el JWT por JWKS.

Los demás microservicios NO crean usuarios, solo validan el JWT (JWKS con `jose`, o llamando a
`GET /api/auth/me` de este servicio, caso de `adminpanel` vía `USERS_SERVICE_URL`).

⚠️ **El sistema real es multi-tenant (multi-colegio) y tiene 3 roles, no 2.** El `CLAUDE.md` raíz del
workspace y el `README.md` de este repo solo documentan `ADMIN`/`TEACHER` y el flujo básico de
auth (`register/login/me/refresh/logout`). El código real agrega:
- Un tercer rol **`SUPERADMIN`** (gestiona colegios, ve todos los tenants).
- Un modelo **`Colegio`** (multi-tenant) con CRUD completo bajo `/api/superadmin/colegios`.
- Un módulo **`admin`** (`/api/admin/*`) para gestión operativa de usuarios (listar, crear, cambiar
  rol, activar/desactivar, resetear password) — no mencionado en el README ni en el CLAUDE.md raíz.

Tratar el README y el CLAUDE.md raíz del workspace como desactualizados en estos puntos; confiar en el
código (`src/`, `prisma/schema.prisma`) como fuente de verdad.

---

## 2. Stack y estructura

- **NestJS 10** + **Prisma 5** (`@prisma/client ^5.0.0`, `previewFeatures = ["multiSchema"]`).
- **`@supabase/supabase-js` v2** como SDK de Supabase Auth (sin librería JWKS propia — este servicio no
  valida JWT por JWKS como `ms-docs`/`ms-perfil-alumno`; usa `supabaseService.getUser(token)`, que llama
  a Supabase directamente en cada request).
- Node 22 (Dockerfile usa `node:22-alpine`).
- Puerto por defecto **3001** (hardcodeado también en `Dockerfile` vía `ENV PORT=3001`; `main.ts` cae a
  `3000` si `process.env.PORT` no está seteado — mantener el `.env` alineado).

```
src/
  app.controller.ts          # GET /health (fuera del prefijo /api? no, setGlobalPrefix aplica: GET /api/health)
  main.ts                    # bootstrap, CORS, ValidationPipe, Swagger /docs
  auth/                      # login/register/refresh/logout/me (todo docente)
    auth.controller.ts
    auth.service.ts
    guards/supabase-auth.guard.ts   # valida Bearer token contra Supabase (cualquier rol autenticado)
    dto/
  users/                     # capa de acceso a la tabla `usuarios` (perfil)
    users.service.ts         # createProfile / findBySupabaseUserId / findByEmail / updateProfile
    user-role.ts             # USER_ROLES = ["SUPERADMIN","ADMIN","TEACHER"]
    dto/
  admin/                     # gestión operativa de usuarios (rol ADMIN o SUPERADMIN)
    admin.controller.ts      # /api/admin/users*  (accede a Prisma/Supabase directo, NO pasa por UsersService)
    guards/admin-role.guard.ts
  colegios/                  # multi-tenant: CRUD de colegios (rol SUPERADMIN)
    colegios.controller.ts   # /api/superadmin/colegios*
    colegios.service.ts
    guards/superadmin-role.guard.ts
    dto/
  common/
    guards/rate-limit.guard.ts       # rate limit in-memory (no Redis), por defecto opt-in
    decorators/rate-limit.decorator.ts
  infrastructure/
    prisma/prisma.service.ts         # PrismaClient con onModuleInit/onModuleDestroy
    supabase/supabase.service.ts     # único punto con SUPABASE_SERVICE_ROLE_KEY
    audit/audit.service.ts           # registrarEvento(...) -> logs_usuarios (nunca lanza)
scripts/                      # utilidades operativas .cjs (no forman parte del build de Nest)
  set-superadmin.cjs          # promueve un usuario existente (por email) a SUPERADMIN
  create-devmode-user.cjs     # crea/actualiza devmode@prisma.local (password "devmode1", role ADMIN)
  backfill-app-metadata.cjs   # sincroniza app_metadata de Supabase para usuarios ya existentes
  assign-colegio.cjs
```

No existe `users.controller.ts`: el perfil propio se expone vía `AuthController` (`GET/PATCH /api/auth/me`),
no vía un controlador `users`. `UsersService` es consumido por `auth`, `admin` y las guards de rol.

---

## 3. Modelo de datos (Prisma, `schema "users"`)

`prisma/schema.prisma` — datasource Postgres con `schemas = ["users"]` (misma instancia física que
`ms-docs` puede compartir vía `multiSchema`, separados por esquema).

### `Colegio` (`@@map("colegios")`)
Tenant. Campos: `id` (uuid), `nombre`, `direccion`, `telefono?`, `email` (unique), `rut` (unique),
`plan` (default `"basic"`), `fechaInicio`, `fechaTermino?`, `activo` (default true, soft-delete),
`createdAt`/`updatedAt`. Relación 1:N con `User`.

### `User` (`@@map("usuarios")`)
- `id` uuid, `supabaseUserId` (unique, `@map("id_supabase")`) — clave de correlación con Supabase Auth
  y con el resto de microservicios.
- `email` (unique, `@map("correo")`), `rut` (unique), `nombreCompleto`, `establecimiento?`, `phone?`
  (`@map("telefono")`), `specialty?` (`@map("especialidad")`), `position?` (`@map("cargo")`).
- `active` (default true), `role` (`UserRole`, default `TEACHER`, `@map("rol")`).
- `colegioId?` uuid → FK a `Colegio` (`onDelete: SetNull`) — `null` es válido (usuario sin tenant
  asignado, ej. `SUPERADMIN` o cuentas legacy pre-multi-tenant).
- Relación 1:N con `LogUsuario`.

### `LogUsuario` (`@@map("logs_usuarios")`)
Auditoría append-only: `id`, `tipoEvento` (enum `TipoEventoUsuario`), `userId?` (FK opcional — puede ser
`null` si el evento falla antes de identificar al usuario), `ipOrigen?`, `resultado` (`success`/`failure`),
`mensaje` (texto libre, incluye detalle de la operación), `fechaHora` (default now).

### Enums
- `UserRole`: `SUPERADMIN | ADMIN | TEACHER` (default `TEACHER`).
- `TipoEventoUsuario`: `register | login | logout | refresh | profile_update | colegio_create |
  colegio_update | colegio_deactivate | admin_create | admin_update | admin_deactivate |
  admin_reactivate | admin_password_reset`.
- `ResultadoOperacion`: `success | failure`.

### Migraciones (orden cronológico, revela la evolución real del esquema)
`20260607000000_restructure_users_schema` → `20260615000000_add_colegio_and_superadmin` →
`20260617000000_add_colegio_audit_events` → `20260617000001_add_admin_audit_events`.
El sistema empezó con 2 roles y sin multi-tenant; `Colegio`/`SUPERADMIN` y los eventos de auditoría
de colegios/admin son incorporaciones posteriores.

---

## 4. Endpoints

Todos bajo el prefijo global `/api` (`setGlobalPrefix("api")` en `main.ts`). Swagger en `/docs`.

### Auth — `src/auth/auth.controller.ts` (`@Controller("auth")`)
| Método | Ruta | Guard | Descripción |
|---|---|---|---|
| POST | `/api/auth/register` | — | Crea usuario en Supabase + perfil en Postgres (rol forzado a `TEACHER`), retorna sesión |
| POST | `/api/auth/login` | — | Login contra Supabase, retorna `access_token`/`refresh_token` + perfil Postgres |
| POST | `/api/auth/refresh` | — | Renueva sesión con `refresh_token` |
| POST | `/api/auth/logout` | `SupabaseAuthGuard` | Invalida sesión (signOut scope `global`) |
| GET | `/api/auth/me` | `SupabaseAuthGuard` | Perfil propio desde Postgres |
| PATCH | `/api/auth/me` | `SupabaseAuthGuard` | Actualiza perfil propio (no permite tocar `rut`, `role`, `colegioId`, `email`) |

### Admin — `src/admin/admin.controller.ts` (`@Controller("admin")`, `AdminRoleGuard` a nivel de clase)
Requiere rol `ADMIN` **o** `SUPERADMIN`. No documentado en README/CLAUDE.md raíz.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/admin/users/stats` | Conteos por rol y activos |
| GET | `/api/admin/users` | Lista todos los usuarios (todo colegio — no filtra por tenant del admin) |
| POST | `/api/admin/users` | Crea usuario (docente o admin) + usuario en Supabase; body inline (sin DTO tipado) |
| PATCH | `/api/admin/users/:id/role` | Cambia rol/colegio y **sincroniza `app_metadata`** en Supabase |
| PATCH | `/api/admin/users/:id/active` | Activa/desactiva usuario |
| POST | `/api/admin/users/:id/reset-password` | Resetea password (genera uno temporal de 12 chars si no se provee) |

### Superadmin / Colegios — `src/colegios/colegios.controller.ts` (`@Controller("superadmin/colegios")`)
Requiere rol `SUPERADMIN` (`SuperAdminRoleGuard`) + `RateLimitGuard` en todas las rutas.

| Método | Ruta | Rate limit | Descripción |
|---|---|---|---|
| GET | `/api/superadmin/colegios` | 100/min | Lista paginada |
| GET | `/api/superadmin/colegios/:id` | 100/min | Detalle + conteo de usuarios/admins |
| POST | `/api/superadmin/colegios` | 10/min | Crea colegio **y su primer ADMIN** (usuario Supabase + Postgres) en una operación |
| PATCH | `/api/superadmin/colegios/:id` | 30/min | Actualiza datos del colegio |
| DELETE | `/api/superadmin/colegios/:id` | 10/min | Soft-delete (`activo = false`) |
| GET | `/api/superadmin/colegios/:id/stats` | 100/min | Conteo de usuarios por rol en el colegio |
| GET | `/api/superadmin/colegios/:id/professors` | 100/min | Lista paginada de `TEACHER` del colegio (filtros `active`, `specialty`) |
| GET | `/api/superadmin/colegios/:id/admins` | 100/min | Lista `ADMIN` del colegio |

### Salud
`GET /api/health` (`app.controller.ts`, sin prefijo de módulo, sin guard).

---

## 5. Integración con Supabase (`src/infrastructure/supabase/supabase.service.ts`)

Dos clientes internos, creados lazy (`getClients()`):
- **`publicClient`** (con `SUPABASE_ANON_KEY`): `signInWithPassword`, `refreshSession`, `getUser`.
- **`adminClient`** (con `SUPABASE_SERVICE_ROLE_KEY`): `auth.admin.createUser`, `deleteUser`,
  `updateUserById` (password y `app_metadata`).

Operaciones expuestas: `register`, `login`, `refresh`, `logout` (crea un cliente *scoped* aparte con el
access token en headers, no reutiliza `publicClient`), `getUser`, `deleteUser`,
`createUserWithPasswordAndMetadata`, `resetUserPassword`, `updateUserAppMetadata`.

**`app_metadata` vs `user_metadata` — el gotcha más importante del repo:**
`app_metadata` es *server-only* (el usuario no puede editarlo desde el SDK cliente); es la fuente segura
del tenant (`role`, `colegioId`) que `ms-docs` y `ms-perfil-alumno` leen del JWT por JWKS. `user_metadata`
es editable por el usuario y **es ignorado por esos guards**. Todo alta o cambio de rol/colegio debe
escribir en `app_metadata` (ver `updateUserAppMetadata`, invocado desde `admin.controller.ts` en
`PATCH /users/:id/role` y desde `colegios.service.ts` al crear un colegio). El nuevo valor solo viaja en
tokens **emitidos después** de un login/refresh — un usuario con sesión activa no ve el cambio hasta
volver a loguearse. Este bug ya ocurrió en producción (ver comentarios en
`scripts/backfill-app-metadata.cjs`: los usuarios existentes tenían el tenant solo en `user_metadata`,
causando 403 "User has no colegioId in token" en los otros servicios) y el script de backfill fue el
parche retroactivo.

---

## 6. Quién consume este servicio

- **prisma-front**: login/registro de docentes vía `VITE_API_BASE_URL` → obtiene el JWT y lo reusa en
  todos los demás servicios.
- **prisma-adminpanel**: valida sesiones de administradores llamando `GET /auth/me` vía
  `USERS_SERVICE_URL` (que en su `.env` **incluye** el prefijo `/api`, ej.
  `http://localhost:3001/api`). También puede consumir `/api/admin/*` para operaciones de gestión.
- **prisma-ms-docs** / **prisma-ms-perfil-alumno**: NO llaman a este servicio en runtime; validan el JWT
  ellos mismos vía JWKS público de Supabase (`SUPABASE_URL`) y leen `app_metadata.role`/`colegioId` del
  token — de ahí la importancia de que este servicio mantenga `app_metadata` sincronizado.

---

## 7. Variables de entorno (`.env.example`)

```env
PORT=3001
CORS_ORIGIN=http://localhost:3002,http://127.0.0.1:3002
NODE_ENV=development

DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY` es exclusivo de este repo dentro de P.R.I.S.M.A. — nunca debe replicarse en
`ms-docs`, `ms-perfil-alumno` ni `adminpanel`. `.env` real está gitignorado; el `.env.example` tiene
`PORT` duplicado (líneas 1 y 4) — inofensivo pero vale limpiarlo si se toca el archivo.

Los scripts en `scripts/*.cjs` leen `.env` con su propio parser manual (`loadEnv`), no con `dotenv` — si
se cambia el formato del `.env` (comillas, multilínea) hay que revisar esos scripts también.

---

## 8. Comandos

```bash
npm install
npm run prisma:generate          # genera cliente Prisma
npm run prisma:migrate:dev       # migración en desarrollo
npm run prisma:migrate:deploy    # aplica migraciones (producción / CI, no corre dentro del Dockerfile)
npm run prisma:studio
npm run prisma:db:push

npm run start:dev                # watch mode (:3001), alias: npm run dev
npm run start:prod               # node dist/main.js
npm run build                    # nest build

npm test                         # Jest
npm run test:watch
npm run test:cov                 # umbral global 90% (statements/branches/functions/lines) — ver jest.coverageThreshold en package.json
npm run lint                     # eslint --fix
```

Scripts operativos (no van en `npm run`, se invocan con `node`):
```bash
node scripts/create-devmode-user.cjs        # crea/resetea devmode@prisma.local (password "devmode1", role ADMIN)
node scripts/set-superadmin.cjs             # promueve devmode@prisma.local a SUPERADMIN (email hardcodeado)
node scripts/backfill-app-metadata.cjs [--dry-run]   # sincroniza app_metadata para usuarios existentes
node scripts/assign-colegio.cjs
```

---

## 9. Gotchas / cosas no obvias

1. **`app_metadata` vs `user_metadata`** (ver §5) — la causa raíz de un incidente 403 real ya
   documentado en el propio repo (comentarios de `backfill-app-metadata.cjs`). Cualquier cambio a rol o
   colegio de un usuario **debe** propagar a `app_metadata`, o los demás microservicios lo verán como
   tenant nulo.
2. **`AdminController` no usa `UsersService`.** A diferencia de `auth`/`colegios`, `admin.controller.ts`
   inyecta `PrismaService` y `SupabaseService` directamente y arma las queries inline (sin DTOs de
   `class-validator` para los bodies — usa interfaces TS planas). Es inconsistente con el resto del
   código y no pasa por las validaciones de `ValidationPipe` de forma estricta (los bodies no son DTOs
   decorados, así que `whitelist`/`forbidNonWhitelisted` no filtra campos extra en esas rutas).
3. **`RateLimitGuard` es in-memory** (`Map` en la instancia del proceso), no distribuido. Con más de una
   instancia/réplica corriendo (ECS con `desiredCount > 1`), el límite efectivo se multiplica por el
   número de instancias. Solo se usa hoy en `colegios.controller.ts`.
4. **`logout` primero resuelve el usuario, luego cierra sesión, y si falla intenta resolverlo de nuevo**
   (`auth.service.ts::logout`) — hay una duplicación de la resolución de `supabaseUser` en el catch que
   repite el mismo `getBearerToken`/`getUser` ya hecho antes del try. Funciona pero es lógica redundante
   a tener en cuenta si se refactoriza.
5. **La auditoría nunca rompe el flujo principal**: `AuditService.registrarEvento` envuelve el `create`
   en un try/catch vacío — un fallo al escribir en `logs_usuarios` es silencioso. Útil saberlo si un
   evento "desaparece" del log: no hay excepción que lo señale.
6. **`register` siempre fuerza `role: "TEACHER"`** del lado de `AuthService`/`SupabaseService`, incluso
   si el DTO no lo expone — no hay endpoint público para auto-registrarse como `ADMIN`/`SUPERADMIN`;
   esos roles solo se asignan vía `/api/admin/users` (rol `ADMIN`+) o `/api/superadmin/colegios` (crea el
   primer `ADMIN` del colegio) o los scripts `set-superadmin.cjs`/`create-devmode-user.cjs`.
7. **Compensación en creación de colegio**: si falla la creación del `Colegio`/`User` en Postgres después
   de haber creado el usuario admin en Supabase, `colegios.service.ts::create` borra el usuario de
   Supabase (`deleteUser`) para no dejar cuentas huérfanas. El mismo patrón de compensación existe en
   `auth.service.ts::register`.
8. **`UpdateMeDto` no permite cambiar `email`, `rut`, `role` ni `colegioId`** — un docente no puede
   auto-promoverse ni cambiarse de colegio vía `PATCH /api/auth/me`. Los cambios sensibles solo pasan
   por `admin`/`superadmin`.
9. **El Dockerfile no corre migraciones** (`prisma migrate deploy` debe ejecutarse como paso aparte en
   CI/ECS) y genera el cliente Prisma dentro del contenedor Alpine (`npx prisma generate`) para el target
   `musl`; el pipeline actual (`.github/workflows/deploy-ecr.yml`) solo hace build+push a ECR y fuerza un
   redeploy de ECS — no incluye el paso de migración.
10. **README.md desactualizado**: documenta solo los 6 endpoints de `auth` y 2 roles; no menciona
    `Colegio`, `SUPERADMIN`, ni los módulos `admin`/`colegios`. Preferir este `CLAUDE.md` y el código
    (`src/`, `prisma/schema.prisma`) como fuente de verdad.
