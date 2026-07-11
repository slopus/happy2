# Build from the repository root:
# docker build -f packages/server/Dockerfile -t slopus/rigged .
FROM node:22-bookworm-slim AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/server/package.json packages/server/package.json
RUN pnpm install --frozen-lockfile
COPY packages/server packages/server
RUN pnpm --filter @slopus/rigged build \
  && pnpm --filter @slopus/rigged --prod deploy /app

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
EXPOSE 3000
ENTRYPOINT ["node", "dist/cli.js"]
