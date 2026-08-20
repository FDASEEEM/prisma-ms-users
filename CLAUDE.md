# CLAUDE.md — prisma-ms-users

> Contexto interno para sesiones de Claude Code trabajando en este repo. Para el mapa completo del
> sistema P.R.I.S.M.A. (los demás repos, flujos end-to-end) ver el `CLAUDE.md` en la raíz del workspace
> `EP2/`. Este archivo describe **solo** `prisma-ms-users`.

---

## 1. Rol dentro de P.R.I.S.M.A.

`prisma-ms-users` es el **dueño de la identidad** del sistema. Es el único microservicio que:

- Tiene las credenciales de **AWS Cognito** (`src/infrastructure/cognito/cognito.service.ts`) → puede
  crear, actualizar, eliminar y resetear contraseñas de usuarios en el **User Pool** (perfil público,
  email/password y federación con Google).
- Persiste el **perfil docente extendido** en PostgreSQL (`schema "users"`, tabla `usuarios`).
- Escribe **auditoría** de eventos de identidad en `logs_usuarios`.
- Escribe `custom:role` y `custom:colegioId` (custom attributes del pool) — es la fuente de verdad del
  **tenant** que leen `ms-docs` y `ms-perfil-alumno` al validar el JWT por JWKS.

Los demás microservicios NO crean usuarios, solo validan el JWT (JWKS con `jose` contra el issuer de
Cognito, o llamando a `GET /api/auth/me` de este servicio, caso de `adminpanel` vía `USERS_SERVICE_URL`).

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
- **`@aws-sdk/client-cognito-identity-provider`** como SDK de AWS Cognito (crear usuarios, login admin,
  refresh, sign-out, resetear passwords, custom attributes) y **`jose`** (v6, ESM-only) para validar los
  JWT de Cognito por JWKS.
- Node 22 (Dockerfile usa `node:22-alpine`).
- Puerto por defecto **3001** (hardcodeado también en `Dockerfile` vía `ENV PORT=3001`; `main.ts` cae a
  `3000` si `process.env.PORT` no está seteado — mantener el `.env` alineado).

```
src/
  app.controller.ts          # GET /health (fuera del prefijo /api? no, setGlobalPrefix aplica: GET /api/health)
  main.ts                    # bootstrap, CORS, ValidationPipe, Swagger /docs
  auth/                      # login/register/refresh/logout/me (todo docente) + OAuth Google
    auth.controller.ts
    auth.service.ts
    guards/cognito-auth.guard.ts       # valida Bearer token contra Cognito por JWKS (cualquier rol autenticado)
    dto/
  users/                     # capa de acceso a la tabla `usuarios` (perfil)
    users.service.ts         # createProfile / findBySupabaseUserId / findByEmail / updateProfile
    user-role.ts             # USER_ROLES = ["SUPERADMIN","ADMIN","TEACHER"]
    dto/
  admin/                     # gestión operativa de usuarios (rol ADMIN o SUPERADMIN)
    admin.controller.ts      # /api/admin/users*  (accede a Prisma/Cognito directo, NO pasa por UsersService)
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
    cognito/cognito.service.ts       # único punto con acceso al User Pool de Cognito
    audit/audit.service.ts           # registrarEvento(...) -> logs_usuarios (nunca lanza)
scripts/                      # utilidades operativas .cjs (no forman parte del build de Nest)
  set-superadmin.cjs          # promueve un usuario existente (por email) a SUPERADMIN
  create-devmode-user.cjs     # crea/actualiza devmode@prisma.local (password "devmode1", role ADMIN)
  backfill-app-metadata.cjs   # legacy: sincroniza app_metadata de Supabase (obsoleto tras migrar a Cognito)
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
- `id` uuid, `supabaseUserId` (unique, `@map("id_supabase")`) — clave de correlación con **Cognito**
  (guarda el `sub` del User Pool; el nombre de la columna es legacy de Supabase) y con el resto de
  microservicios.
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
| POST | `/api/auth/register` | — | Crea usuario en Cognito (`AdminCreateUser` + password permanente) + perfil en Postgres (rol forzado a `TEACHER`), retorna sesión |
| POST | `/api/auth/login` | — | Login contra Cognito (`AdminInitiateAuth`, flow `ADMIN_NO_SRP_AUTH`), retorna `access_token`/`refresh_token` + perfil Postgres |
| POST | `/api/auth/refresh` | — | Renueva sesión con `refresh_token` (flow `REFRESH_TOKEN_AUTH`) |
| POST | `/api/auth/google/url` | — | Devuelve la URL del Hosted UI de Cognito (`authorize` con `identity_provider=Google`) |
| POST | `/api/auth/google/callback` | — | Intercambia `code` en el token endpoint de Cognito y aprovisiona/vincula al usuario |
| POST | `/api/auth/logout` | `CognitoAuthGuard` | Invalida sesión (`GlobalSignOut`) |
| GET | `/api/auth/me` | `CognitoAuthGuard` | Perfil propio desde Postgres |
| PATCH | `/api/auth/me` | `CognitoAuthGuard` | Actualiza perfil propio (no permite tocar `rut`, `role`, `colegioId`, `email`) |

### Admin — `src/admin/admin.controller.ts` (`@Controller("admin")`, `AdminRoleGuard` a nivel de clase)
Requiere rol `ADMIN` **o** `SUPERADMIN`. No documentado en README/CLAUDE.md raíz.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/admin/users/stats` | Conteos por rol y activos |
| GET | `/api/admin/users` | Lista todos los usuarios (todo colegio — no filtra por tenant del admin) |
| POST | `/api/admin/users` | Crea usuario (docente o admin) + usuario en Cognito; body inline (sin DTO tipado) |
| PATCH | `/api/admin/users/:id/role` | Cambia rol/colegio y **sincroniza `custom:role`/`custom:colegioId`** en Cognito |
| PATCH | `/api/admin/users/:id/active` | Activa/desactiva usuario |
| POST | `/api/admin/users/:id/reset-password` | Resetea password (genera uno temporal de 12 chars si no se provee) |

### Superadmin / Colegios — `src/colegios/colegios.controller.ts` (`@Controller("superadmin/colegios")`)
Requiere rol `SUPERADMIN` (`SuperAdminRoleGuard`) + `RateLimitGuard` en todas las rutas.

| Método | Ruta | Rate limit | Descripción |
|---|---|---|---|
| GET | `/api/superadmin/colegios` | 100/min | Lista paginada |
| GET | `/api/superadmin/colegios/:id` | 100/min | Detalle + conteo de usuarios/admins |
| POST | `/api/superadmin/colegios` | 10/min | Crea colegio **y su primer ADMIN** (usuario Cognito + Postgres) en una operación |
| PATCH | `/api/superadmin/colegios/:id` | 30/min | Actualiza datos del colegio |
| DELETE | `/api/superadmin/colegios/:id` | 10/min | Soft-delete (`activo = false`) |
| GET | `/api/superadmin/colegios/:id/stats` | 100/min | Conteo de usuarios por rol en el colegio |
| GET | `/api/superadmin/colegios/:id/professors` | 100/min | Lista paginada de `TEACHER` del colegio (filtros `active`, `specialty`) |
| GET | `/api/superadmin/colegios/:id/admins` | 100/min | Lista `ADMIN` del colegio |

### Salud
`GET /api/health` (`app.controller.ts`, sin prefijo de módulo, sin guard).

---

## 5. Integración con AWS Cognito (`src/infrastructure/cognito/cognito.service.ts`)

Un solo cliente `CognitoIdentityProviderClient` (credentials de la task role de ECS) + HTTP contra el
Hosted UI para OAuth:

- **User pool (SDK)**: `AdminCreateUser` + `AdminSetUserPassword` (register), `AdminInitiateAuth` con
  `ADMIN_NO_SRP_AUTH` (login) y `REFRESH_TOKEN_AUTH` (refresh), `AdminGetUser`, `GlobalSignOut` (logout),
  `AdminDeleteUser`, `AdminUpdateUserAttributes`, `AdminSetUserPassword` (reset).
- **OAuth (HTTP)**: `getGoogleAuthUrl` arma `${COGNITO_DOMAIN}/oauth2/authorize`; `exchangeGoogleCode`
  postea a `${COGNITO_DOMAIN}/oauth2/token` con `grant_type=authorization_code`.
- **JWT (jose)**: `verifyToken` valida firma contra el JWKS del issuer
  `https://cognito-idp.{region}.amazonaws.com/{poolId}`. `CognitoAuthGuard` y las guards de rol
  (`admin-role.guard.ts`, `superadmin-role.guard.ts`) lo usan para poblar `request.user`.

**`custom:role` / `custom:colegioId` — el equivalente a `app_metadata` (y el gotcha más importante):**
en el JWT de Cognito los custom attributes viajan como claims **planos** `custom:role` y
`custom:colegioId` (NO anidados). Son la fuente segura del tenant que leen `ms-docs` y `ms-perfil-alumno`
por JWKS. Todo alta o cambio de rol/colegio debe escribir esos atributos (ver `updateUserAppMetadata`,
que mapea `{ role, colegioId }` → `custom:role`/`custom:colegioId`; invocado desde
`admin.controller.ts` en `PATCH /users/:id/role` y desde `colegios.service.ts` al crear un colegio). El
nuevo valor solo viaja en tokens **emitidos después** de un login/refresh — un usuario con sesión activa
no ve el cambio hasta volver a loguearse. El `scripts/backfill-app-metadata.cjs` quedó obsoleto tras la
migración de Supabase a Cognito (los custom attributes se escriben vía `AdminUpdateUserAttributes`).

---

## 6. Quién consume este servicio

- **prisma-front**: login/registro de docentes vía `VITE_BFF_URL` (pasa por `prisma-bff`) → obtiene el JWT
  y lo reusa en todos los demás servicios.
- **prisma-adminpanel**: valida sesiones de administradores llamando `GET /auth/me` vía
  `USERS_SERVICE_URL` (que en su `.env` **incluye** el prefijo `/api`, ej.
  `http://localhost:3001/api`). También puede consumir `/api/admin/*` para operaciones de gestión.
- **prisma-ms-docs** / **prisma-ms-perfil-alumno**: NO llaman a este servicio en runtime; validan el JWT
  ellos mismos vía JWKS de Cognito (`COGNITO_REGION`/`COGNITO_USER_POOL_ID`) y leen `custom:role`/
  `custom:colegioId` del token — de ahí la importancia de que este servicio mantenga esos custom
  attributes sincronizados.

---

## 7. Variables de entorno (`.env.example`)

```env
PORT=3001
CORS_ORIGIN=http://localhost:3002,http://127.0.0.1:3002
NODE_ENV=development

DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require

COGNITO_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_XXXXXX
COGNITO_CLIENT_ID=<app client id (sin secret)>
COGNITO_DOMAIN=https://<your-pool>.auth.us-east-1.amazoncognito.com
```

Los valores de Cognito son exclusivos de este repo dentro de P.R.I.S.M.A. — `ms-docs`/`ms-perfil-alumno`
solo usan `COGNITO_REGION` y `COGNITO_USER_POOL_ID` (para JWKS), nunca el client id/domain. `.env` real
está gitignorado; el `.env.example` tiene `PORT` duplicado (líneas 1 y 4) — inofensivo pero vale limpiarlo
si se toca el archivo.

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
node scripts/backfill-app-metadata.cjs [--dry-run]   # legacy (Supabase, obsoleto tras migrar a Cognito)
node scripts/assign-colegio.cjs
```

---

## 9. Gotchas / cosas no obvias

1. **`custom:role`/`custom:colegioId`** (ver §5) — la causa raíz de un incidente 403 real bajo Supabase
   (`app_metadata` desincronizado; hoy equivalente en Cognito). Cualquier cambio a rol o colegio de un
   usuario **debe** propagar a los custom attributes del pool, o los demás microservicios lo verán como
   tenant nulo. Ojo: en el JWT de Cognito esos claims van **planos** (`custom:role`), no anidados.
2. **`AdminController` no usa `UsersService`.** A diferencia de `auth`/`colegios`, `admin.controller.ts`
   inyecta `PrismaService` y `CognitoService` directamente y arma las queries inline (sin DTOs de
   `class-validator` para los bodies — usa interfaces TS planas). Es inconsistente con el resto del
   código y no pasa por las validaciones de `ValidationPipe` de forma estricta (los bodies no son DTOs
   decorados, así que `whitelist`/`forbidNonWhitelisted` no filtra campos extra en esas rutas).
3. **`RateLimitGuard` es in-memory** (`Map` en la instancia del proceso), no distribuido. Con más de una
   instancia/réplica corriendo (ECS con `desiredCount > 1`), el límite efectivo se multiplica por el
   número de instancias. Solo se usa hoy en `colegios.controller.ts`.
4. **`logout` primero resuelve el usuario, luego cierra sesión, y si falla intenta resolverlo de nuevo**
   (`auth.service.ts::logout`) — hay una duplicación de la resolución del usuario en el catch que
   repite el mismo `getBearerToken`/`getUser` ya hecho antes del try. Funciona pero es lógica redundante
   a tener en cuenta si se refactoriza.
5. **La auditoría nunca rompe el flujo principal**: `AuditService.registrarEvento` envuelve el `create`
   en un try/catch vacío — un fallo al escribir en `logs_usuarios` es silencioso. Útil saberlo si un
   evento "desaparece" del log: no hay excepción que lo señale.
6. **`register` siempre fuerza `role: "TEACHER"`** del lado de `AuthService`/`CognitoService`, incluso
   si el DTO no lo expone — no hay endpoint público para auto-registrarse como `ADMIN`/`SUPERADMIN`;
   esos roles solo se asignan vía `/api/admin/users` (rol `ADMIN`+) o `/api/superadmin/colegios` (crea el
   primer `ADMIN` del colegio) o los scripts `set-superadmin.cjs`/`create-devmode-user.cjs`.
7. **Compensación en creación de colegio**: si falla la creación del `Colegio`/`User` en Postgres después
   de haber creado el usuario admin en Cognito, `colegios.service.ts::create` borra el usuario del pool
   (`deleteUser`) para no dejar cuentas huérfanas. El mismo patrón de compensación existe en
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
