# API image: Express + Socket.io + Prisma.
# Build from the REPOSITORY ROOT (the API uses the shared workspace packages):
#   docker build -f apps/api/Dockerfile -t restaurant-api .

# ---------- install (with build tools for native modules: argon2, sharp) ----------
FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY config/package.json config/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
# Runtime dependencies of the API workspace only (the root postinstall is skipped:
# it needs the schema, which is copied below).
RUN npm ci --omit=dev --workspace=@app/api --include-workspace-root=false --ignore-scripts \
    && npm rebuild argon2 sharp \
    && mkdir -p apps/api/node_modules

# ---------- runtime ----------
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY package.json ./
COPY config ./config
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
# Workspace packages are linked as symlinks by npm; recreate them for the copied sources.
RUN mkdir -p node_modules/@app \
    && ln -sfn ../../config node_modules/@app/config \
    && ln -sfn ../../packages/shared node_modules/@app/shared \
    && cd apps/api && npx prisma generate \
    && mkdir -p /app/apps/api/uploads && chown -R node:node /app/apps/api/uploads

WORKDIR /app/apps/api
USER node
EXPOSE 4000
# Healthy once the API answers and the database is reachable.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply pending migrations, then start. (Migrations are additive and safe to re-run.)
# SEED_IF_EMPTY=true also loads the menu, tables and manager into a fresh database
# (for hosts without a shell, such as Render's free plan).
CMD ["sh", "-c", "npx prisma migrate deploy && if [ \"$SEED_IF_EMPTY\" = \"true\" ]; then npx tsx prisma/seed.ts --if-empty; fi && exec npx tsx src/server.ts"]
