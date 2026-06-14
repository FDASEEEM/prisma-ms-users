# ──────────────────────────────────────────────────────────────────────────
# prisma-ms-users — NestJS 10 + Prisma 5 (auth + perfil docente)  →  :3001
# Multi-stage: (1) build (compila TS + genera cliente Prisma), (2) runtime slim.
#
# Las migraciones NO corren aquí (prisma CLI vive en devDependencies y la imagen
# runtime solo trae deps de producción). Ejecútalas como paso aparte del deploy:
#   npx prisma migrate deploy   (en CI o en una task one-off de ECS)
# ──────────────────────────────────────────────────────────────────────────

# Stage 1: build
FROM node:20-alpine AS builder

# openssl + libc6-compat: requeridos por el query engine de Prisma en Alpine (musl)
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Genera el cliente Prisma para el target musl (corre dentro del contenedor Alpine)
RUN npx prisma generate
RUN npm run build

# Stage 2: runtime
FROM node:20-alpine AS runtime

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Artefactos del build: JS compilado, schema/migraciones y cliente Prisma generado
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

ENV NODE_ENV=production
ENV PORT=3001

# Ejecutar como usuario sin privilegios (incluido en la imagen oficial de node)
USER node

EXPOSE 3001

CMD ["node", "dist/main.js"]
