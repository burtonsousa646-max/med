FROM node:26-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
# Зависимости устанавливает pnpm той же версии, что и в рабочем пространстве.
RUN node --input-type=module -e "import{writeFile}from'node:fs/promises';import{createHash}from'node:crypto';const m=await(await fetch('https://registry.npmjs.org/@pnpm/exe.linux-'+process.arch+'/12.16.1')).json();const r=await fetch(m.dist.tarball);if(!r.ok)throw Error('Не удалось загрузить pnpm');const b=Buffer.from(await r.arrayBuffer());const[a,h]=m.dist.integrity.split('-');if(createHash(a).update(b).digest('base64')!==h)throw Error('Неверная целостность pnpm');await writeFile('/tmp/pnpm.tgz',b)" \
    && mkdir /opt/pnpm && tar -xzf /tmp/pnpm.tgz -C /opt/pnpm \
    && ln -s /opt/pnpm/package/pnpm /usr/local/bin/pnpm

WORKDIR /opt/haraka
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts \
    && pnpm exec haraka -i /opt/haraka/app \
    && mkdir -p /opt/haraka/app/queue \
    && chown -R node:node /opt/haraka/app
COPY config/ app/config/
COPY plugins/ app/plugins/
COPY start.sh ./
USER node
EXPOSE 587
ENTRYPOINT ["sh", "/opt/haraka/start.sh"]
