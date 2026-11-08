# tracker（香港 VPS，Dokploy Application）。Build context = repo 根目錄：
#   Dockerfile 路徑 apps/tracker/Dockerfile，Context 路徑 .
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
# 先抄 package.json 再裝，改 code 唔使重新裝套件（Docker layer cache）
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY apps/tracker/package.json apps/tracker/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
RUN pnpm install --frozen-lockfile --filter tracker... --ignore-scripts
COPY packages/core packages/core
COPY apps/tracker apps/tracker
RUN pnpm --filter tracker test && pnpm --filter tracker build

# 運行：esbuild 已經將 core 打包入 dist，唔使 node_modules
FROM node:22-alpine
WORKDIR /app
COPY --from=build /repo/apps/tracker/dist ./dist
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/health >/dev/null || exit 1
CMD ["node", "dist/index.js"]
