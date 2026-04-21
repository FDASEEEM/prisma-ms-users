## prisma-ms-users

Microservicio de usuarios en Nest.js para PRISMA. Gestiona registro, autenticación, renovación de sesión, cierre de sesión y perfil extendido de docentes.

### Stack

- `NestJS` para la API.
- `Supabase Auth` para identidad, login y tokens.
- `PostgreSQL` + `Prisma` para el perfil extendido en la tabla `users`.

### Responsabilidad

Este servicio actúa como puente entre Supabase Auth y PostgreSQL:

- Crea usuarios en Supabase.
- Persiste el perfil docente en la tabla `users`.
- Protege endpoints con JWT de Supabase.
- Aplica compensación si falla la persistencia local después del alta en Supabase.

### Endpoints

#### `POST /api/auth/register`

Crea el usuario en Supabase, guarda el perfil extendido y retorna sesión JWT.

#### `POST /api/auth/login`

Autentica credenciales contra Supabase y retorna `access_token` y `refresh_token`.

#### `POST /api/auth/refresh`

Renueva la sesión usando el `refresh_token`.

#### `POST /api/auth/logout`

Invalida la sesión activa en Supabase. Requiere `Authorization: Bearer <access_token>`.

#### `GET /api/auth/me`

Retorna el perfil completo del docente autenticado desde PostgreSQL.

#### `PATCH /api/auth/me`

Actualiza datos editables del perfil. El `rut` no se modifica.

### Variables de entorno

Usa `.env.example` como referencia:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PORT`

> Nota: en este workspace la conexión de PostgreSQL ya quedó apuntando a la instancia de Aiven en `.env`.

### Instalación

```bash
npm install
npm run prisma:generate
```

### Migraciones

```bash
npm run prisma:migrate:deploy
```

Para desarrollo local también puedes usar:

```bash
npm run prisma:migrate:dev -- --name init
```

### Ejecución

```bash
npm run start:dev
```

### Pruebas

```bash
npm test
```
