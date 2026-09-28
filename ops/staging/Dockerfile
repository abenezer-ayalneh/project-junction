FROM node:24-bookworm-slim AS build

RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV HUSKY=0
COPY . .
RUN pnpm install --frozen-lockfile
ENV NEXT_PUBLIC_JUNCTION_RUNTIME_MODE=staging NEXT_PUBLIC_JUNCTION_API_URL=/v1
RUN pnpm nx run-many -t build --projects=web,api,worker --parallel=2

FROM node:24-bookworm-slim
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app /app
USER node
ENTRYPOINT ["/app/ops/staging/load-secrets.sh"]
