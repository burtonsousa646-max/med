# syntax=docker/dockerfile:1
# Build context is MED/, because the frontend imports ../design-system.
FROM node:22-bookworm-slim AS dependencies
WORKDIR /app/prototype-app
COPY prototype-app/package.json prototype-app/package-lock.json prototype-app/.npmrc ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM dependencies AS build
COPY design-system /app/design-system
COPY prototype-app/ ./
ARG VITE_METRIKA_ID=
ENV VITE_METRIKA_ID=$VITE_METRIKA_ID
RUN npm test && node --test scripts/*.test.ts && npm run build

FROM node:22-bookworm-slim AS api-dependencies
WORKDIR /app/prototype-app
COPY prototype-app/package.json prototype-app/package-lock.json prototype-app/.npmrc ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --no-audit --no-fund

FROM api-dependencies AS api
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=8787 DB_PATH=/data/demo.sqlite
COPY --chown=node:node prototype-app/server ./server
COPY --chown=node:node prototype-app/shared ./shared
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.ts"]

FROM caddy:2-alpine AS web
COPY --from=build /app/prototype-app/dist /srv
COPY prototype-app/deploy/Caddyfile /etc/caddy/Caddyfile
RUN addgroup -S -g 1000 app && adduser -S -u 1000 -G app app && chown -R app:app /data /config
USER app
ENV SITE_ADDRESS=:8080
EXPOSE 8080 8081 8443
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8081/healthz || exit 1
