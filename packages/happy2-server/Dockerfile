# Build from the repository root:
# docker build -f packages/happy2-server/Dockerfile -t slopus/happy2 .
FROM node:22-bookworm-slim AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/happy2-server/package.json packages/happy2-server/package.json
RUN pnpm install --frozen-lockfile
COPY packages/happy2-server packages/happy2-server
RUN pnpm --filter happy2-server build:server \
  && pnpm --filter happy2-server --prod deploy /app

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
EXPOSE 3000
ENTRYPOINT ["node", "dist/cli.js"]
