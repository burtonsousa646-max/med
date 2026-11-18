FROM node:26-bookworm-slim AS build
WORKDIR /workspace
# Bootstrap фиксированного pnpm без npm/yarn. Зависимости проекта устанавливает pnpm.
RUN node --input-type=module -e "import{writeFile}from'node:fs/promises';import{createHash}from'node:crypto';const m=await(await fetch('https://registry.npmjs.org/@pnpm/exe.linux-'+process.arch+'/12.16.1')).json();const r=await fetch(m.dist.tarball);if(!r.ok)throw Error('Не удалось загрузить pnpm');const b=Buffer.from(await r.arrayBuffer());const[a,h]=m.dist.integrity.split('-');if(createHash(a).update(b).digest('base64')!==h)throw Error('Неверная целостность pnpm');await writeFile('/tmp/pnpm.tgz',b)" \
    && mkdir /opt/pnpm && tar -xzf /tmp/pnpm.tgz -C /opt/pnpm \
    && ln -s /opt/pnpm/package/pnpm /usr/local/bin/pnpm \
    && pnpm --version
ENV HUSKY=0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api/package.json api/package.json
COPY server/apps/api-gateway/package.json server/apps/api-gateway/package.json
COPY server/apps/suggestion-service/package.json server/apps/suggestion-service/package.json
COPY server/shared/config/package.json server/shared/config/package.json
COPY server/shared/contracts/package.json server/shared/contracts/package.json
COPY server/shared/feature-flags/package.json server/shared/feature-flags/package.json
COPY server/shared/health/package.json server/shared/health/package.json
COPY server/shared/logger/package.json server/shared/logger/package.json
COPY server/shared/tooling/package.json server/shared/tooling/package.json
COPY tests/api/package.json tests/api/package.json
COPY tests/e2e/package.json tests/e2e/package.json
COPY web/packages/api-client/package.json web/packages/api-client/package.json
COPY web/packages/config/package.json web/packages/config/package.json
COPY web/packages/design-system/package.json web/packages/design-system/package.json
COPY web/packages/feature-flags/package.json web/packages/feature-flags/package.json
COPY web/packages/design-system/beef-conf-2.0.0-carnica-3830.0.tgz web/packages/design-system/beef-conf-2.0.0-carnica-3830.0.tgz
COPY web/packages/design-system/beef-react-2.0.0-carnica-3830.0.tgz web/packages/design-system/beef-react-2.0.0-carnica-3830.0.tgz
COPY web/packages/design-system/beef-testing-2.0.0-carnica-3830.0.tgz web/packages/design-system/beef-testing-2.0.0-carnica-3830.0.tgz
COPY web/packages/design-system/beef-utils-2.0.0-carnica-3830.0.tgz web/packages/design-system/beef-utils-2.0.0-carnica-3830.0.tgz
COPY web/packages/design-system/fork-react-qr-rounded-1.0.1.tgz web/packages/design-system/fork-react-qr-rounded-1.0.1.tgz
COPY web/packages/design-system/graphics-2.0.0-carnica-3830.0.tgz web/packages/design-system/graphics-2.0.0-carnica-3830.0.tgz
COPY web/packages/design-system/themes-2.0.0-carnica-3830.0.tgz web/packages/design-system/themes-2.0.0-carnica-3830.0.tgz
COPY web/packages/design-system/ui-kit-2.0.0-carnica-3830.0.tgz web/packages/design-system/ui-kit-2.0.0-carnica-3830.0.tgz
COPY web/packages/design-system/utils-2.0.0-carnica-3830.0.tgz web/packages/design-system/utils-2.0.0-carnica-3830.0.tgz
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @platform/contracts build \
    && pnpm --filter @platform/config build \
    && pnpm --filter @platform/logger build \
    && pnpm --filter @platform/health build \
    && pnpm --filter @platform/feature-flags build \
    && pnpm --filter @platform/api-gateway build \
    && pnpm --filter @platform/api-gateway deploy --prod --legacy /runtime
FROM node:26-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /runtime/ /app/
USER node
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --retries=10 CMD node -e "fetch('http://127.0.0.1:3000/health/ready').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/main.js"]
