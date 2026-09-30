FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS build

RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV HUSKY=0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY libs/contracts/package.json libs/contracts/package.json
COPY libs/platform-core/package.json libs/platform-core/package.json
RUN pnpm install --frozen-lockfile
COPY . .
ENV NEXT_PUBLIC_JUNCTION_RUNTIME_MODE=staging NEXT_PUBLIC_JUNCTION_API_URL=/v1
RUN pnpm nx run-many -t build --projects=web,api,worker --parallel=2

FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app /app
# Keep the release image free of application source, local fixture helpers, and
# test-only tooling. Runtime services resolve only compiled workspace packages,
# generated Prisma client files, migrations, and the listed staging tools.
RUN rm -rf \
        /app/apps/api/src \
        /app/apps/worker/src \
        /app/apps/web/src \
        /app/libs/contracts/src \
        /app/libs/platform-core/src \
    && rm -f /app/libs/platform-core/media-local-init.mjs \
    && find /app/tools -maxdepth 1 -type f \
        ! -name apply-auth-migrations.mjs \
        ! -name staging-preflight.mjs \
        ! -name staging-web-preflight.mjs \
        ! -name verify-staging-minio.mjs \
        -delete \
    && find /app/apps/api/dist /app/apps/worker/dist -type f \
        \( -name '*.d.ts' -o -name '*.d.ts.map' -o -name '*.js.map' -o -name '*.tsbuildinfo' \) -delete \
    && test ! -d /app/apps/api/src \
    && test ! -d /app/apps/worker/src \
    && test ! -d /app/apps/web/src \
    && test ! -d /app/libs/contracts/src \
    && test ! -d /app/libs/platform-core/src \
    && node --input-type=module -e "await import('./libs/platform-core/dist/index.js'); await import('./libs/platform-core/dist/lib/auth.js')" \
    && node -e "require.resolve('platform-core', { paths: ['/app/apps/api/dist'] }); require.resolve('platform-core', { paths: ['/app/apps/worker/dist'] })" \
    && node --check /app/apps/api/dist/main.js \
    && node --check /app/apps/worker/dist/main.js
# The API file logger writes relative to /app. The copied application tree is
# read-only at runtime, so create its only writable application directory now.
RUN mkdir -p /app/logs && chown node:node /app/logs
USER node
ENTRYPOINT ["/app/ops/staging/load-secrets.sh"]
