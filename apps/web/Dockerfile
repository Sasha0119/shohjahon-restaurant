# Web image: Next.js (standalone server).
# Build from the REPOSITORY ROOT:
#   docker build -f apps/web/Dockerfile --build-arg API_INTERNAL_URL=http://api:4000 -t restaurant-web .
#
# API_INTERNAL_URL is where this server forwards /api, /uploads and /socket.io.
# Next.js bakes rewrites in at BUILD time, so it is a build argument.

FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY config/package.json config/
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=@app/web --include-workspace-root=false --ignore-scripts
COPY config ./config
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN mkdir -p node_modules/@app \
    && ln -sfn ../../config node_modules/@app/config \
    && ln -sfn ../../packages/shared node_modules/@app/shared
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
RUN npm run build --workspace=@app/web

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
# The standalone bundle mirrors the monorepo layout (apps/web/server.js).
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
