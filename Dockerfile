# Build from the repository root:
# docker build -t slopus/happy2 .
FROM node:24-bookworm-slim AS build
WORKDIR /workspace
RUN corepack enable
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/happy2-server/package.json packages/happy2-server/package.json
COPY packages/happy2-state/package.json packages/happy2-state/package.json
COPY packages/happy2-ui/package.json packages/happy2-ui/package.json
COPY packages/happy2-app/package.json packages/happy2-app/package.json
COPY packages/happy2-web/package.json packages/happy2-web/package.json
COPY packages/happy2-gym/package.json packages/happy2-gym/package.json
RUN pnpm install --frozen-lockfile --filter happy2-server --filter happy2-web...
COPY tsconfig.base.json tsconfig.json ./
COPY packages/happy2-server packages/happy2-server
COPY packages/happy2-state packages/happy2-state
COPY packages/happy2-ui packages/happy2-ui
COPY packages/happy2-app packages/happy2-app
COPY packages/happy2-web packages/happy2-web
RUN pnpm --filter happy2-server build:server \
  && VITE_HAPPY2_SERVER_URL=/ pnpm --filter happy2-web exec vite build --outDir ../happy2-server/dist/web --emptyOutDir false \
  && pnpm --filter happy2-server --prod deploy --legacy /app

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
ENTRYPOINT ["node", "dist/runner.js"]
