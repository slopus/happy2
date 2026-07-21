# syntax=docker/dockerfile:1.7-labs
# Build from the repository root:
# docker build -t slopus/happy2 .
FROM node:24-bookworm-slim AS build
WORKDIR /workspace
RUN corepack enable
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Preserve every workspace manifest's parent directory so new plugin packages
# participate in the filtered install without maintaining another list here.
COPY --parents packages/*/package.json ./
# pnpm only creates a workspace package's bin links when the declared target
# exists, so the plugin builder source must be available during installation.
COPY packages/happy2-plugin-sdk packages/happy2-plugin-sdk
RUN pnpm install --frozen-lockfile --filter happy2-server... --filter happy2-web... --filter './packages/happy2-plugin-*'...
COPY tsconfig.base.json tsconfig.json ./
COPY packages packages
RUN pnpm run plugins:build \
  && pnpm --filter happy2-server build \
  && VITE_HAPPY2_SERVER_URL=/ pnpm --filter happy2-web exec vite build --outDir ../happy2-server/dist/web --emptyOutDir false \
  && pnpm --filter happy2-server --prod deploy --legacy /app

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
ENTRYPOINT ["node", "dist/runner.js"]
