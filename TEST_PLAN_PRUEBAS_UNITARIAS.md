# Plan de pruebas unitarias

Rama de trabajo: `pruebas-unitarias`

Cobertura actual medida con `npm test -- --coverage --runInBand --coverageReporters=text-summary`:
- Statements: 40.06%
- Branches: 39.24%
- Functions: 55%
- Lines: 39.78%

Objetivo:
- Llevar el microservicio a al menos 90% de cobertura global, con foco en ramas de negocio, errores esperados y dependencias externas mockeadas.

## Fase 1: cerrar la base de servicios

1. Completar `AuthService` con los caminos que faltan:
- `register`: error en Supabase, rollback con `deleteUser`, auditoría de éxito y fallo.
- `login`: perfil no encontrado, auditoría de éxito y fallo.
- `refresh`: éxito y fallo.
- `logout`: validación del header `Authorization`, flujo exitoso, fallo en logout y fallback de resolución de `userId`.
- `me` y `updateMe`: usuario autenticado ausente, caso feliz.

2. Completar `UsersService`:
- `createProfile`: mapeo de DTO completo y valor por defecto de `active`.
- `findBySupabaseUserId`: encontrado y no encontrado.
- `findByEmail`: encontrado y `null`.
- `updateProfile`: éxito, `NotFoundException` previo, error Prisma `P2025`, error genérico, auditoría en éxito y fallo.

3. Completar `SupabaseService`:
- `register`: create user fallido, login fallido y rollback.
- `login`: sesión válida e inválida.
- `refresh`: sesión válida e inválida.
- `logout`: `signOut` exitoso y error de Supabase.
- `getUser`: usuario válido e inválido.
- `deleteUser`: éxito y error.
- `getRequiredConfig`: faltan variables de entorno.

## Fase 2: capa HTTP y guard

1. Añadir pruebas unitarias de `AuthController`:
- Propagar `ip` y payload a `AuthService`.
- Verificar `logout`, `me` y `updateMe`.

2. Añadir pruebas de `SupabaseAuthGuard`:
- Rechazo sin header `Authorization`.
- Rechazo con esquema inválido.
- Aceptación con `Bearer` válido y asignación de `request.user`.

3. Añadir pruebas de `AppController` como unitarias:
- Respuesta exacta de `GET /health`.

## Fase 3: validaciones y módulos

1. Pruebas de DTOs si hay reglas de `class-validator` relevantes:
- `RegisterDto`, `LoginDto`, `RefreshTokenDto`, `UpdateMeDto`, `CreateUserProfileDto`, `UpdateUserProfileDto`.

2. Pruebas de wiring básico:
- `AuthModule`, `UsersModule`, `AppModule` solo si aportan cobertura útil o detectan regressions de providers/imports.

## Fase 4: ejecución y umbral

1. Ejecutar cobertura tras cada bloque:
- `npm test -- --runInBand`
- `npm test -- --coverage --runInBand`

2. Revisar el reporte de cobertura por archivo y cerrar solo los huecos que impidan superar el 90% global.

3. Si un archivo ya está en 90% pero sigue con ramas críticas sin cubrir, priorizar los caminos de error antes de sumar tests redundantes.

## Orden recomendado de implementación

1. `SupabaseService`
2. `UsersService`
3. `AuthService`
4. `SupabaseAuthGuard`
5. `AuthController`
6. `AppController`

## Criterio de cierre

- Cobertura global mínima de 90% en statements, branches, functions y lines.
- Todos los flujos de error principales cubiertos con mocks.
- La suite debe pasar en modo secuencial sin depender de servicios externos reales.