# syntax=docker/dockerfile:1.7

# ---------- Stage 1: build the SPA and bundle the server ----------------
FROM node:24-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json tsconfig.build.json vite.config.ts vitest.config.ts eslint.config.js ./
COPY index.html ./
COPY src ./src
COPY server ./server

RUN npm run typecheck && npm run build


# ---------- Stage 2: runtime -------------------------------------------
# The Playwright image ships Chromium plus its OS dependencies, but NOT the
# npm package - so playwright-core is installed here and pinned to exactly
# this tag's version, or the executable-path lookup breaks.
FROM mcr.microsoft.com/playwright:v1.62.1-noble AS runtime

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    STATIC_ROOT=/app/dist \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

# Runtime dependencies only. Everything the browser needs was bundled into
# dist/ by Vite, so --omit=dev keeps this layer to four packages.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server

# The image runs as root by default, which disables the Chromium sandbox.
# This service renders untrusted, client-supplied HTML, so it does not.
RUN chown -R pwuser:pwuser /app
USER pwuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist-server/index.js"]
