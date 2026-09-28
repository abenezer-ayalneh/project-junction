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
USER node
ENTRYPOINT ["/app/ops/staging/load-secrets.sh"]
