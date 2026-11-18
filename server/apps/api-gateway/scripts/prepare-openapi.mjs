// Используется parser уже установленного express-openapi-validator; новых parser-зависимостей нет.
import { createRequire } from 'node:module'
import { readdir, mkdir, cp, realpath } from 'node:fs/promises'
import { dirname, resolve, relative, join, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
const require = createRequire(import.meta.url)
const nested = createRequire(require.resolve('express-openapi-validator'))
const { parse } = await import(nested.resolve('@apidevtools/json-schema-ref-parser'))
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const apiDir = resolve(appDir, '../../../api')
export async function checkLocalRefs(root) {
  const base = await realpath(root)
  const checked = new Set()
  async function inspect(path) {
    const file = await realpath(path)
    const location = relative(base, file)
    if (location.startsWith('..') || isAbsolute(location))
      throw new Error('Ссылка выходит за каталог контрактов')
    if (checked.has(file)) return
    checked.add(file)
    const doc = await parse(file)
    const visited = new WeakSet()
    async function walk(value) {
      if (!value || typeof value !== 'object' || visited.has(value)) return
      visited.add(value)
      for (const [key, child] of Object.entries(value)) {
        if (key === '$id') throw new Error('Изменение базового URI схемы запрещено')
        if (key === '$ref') {
          if (typeof child !== 'string') throw new Error('Некорректная ссылка контракта')
          const local = decodeURIComponent(child.split('#')[0])
          if (local) {
            if (/^[a-z][a-z0-9+.-]*:/i.test(local) || isAbsolute(local) || local.includes('\\'))
              throw new Error('Внешняя ссылка запрещена')
            await inspect(resolve(dirname(file), local))
          }
        }
        await walk(child)
      }
    }
    await walk(doc)
  }
  const files = (await readdir(root, { recursive: true })).filter(
    (f) => /\.(?:ya?ml|json)$/.test(f) && !f.split(/[\\/]/).includes('node_modules'),
  )
  for (const name of files) await inspect(join(root, name))
}
export async function prepareOpenApi() {
  await checkLocalRefs(apiDir)
  const out = join(appDir, 'dist/openapi')
  await mkdir(out, { recursive: true })
  const files = (await readdir(join(apiDir, 'openapi'))).filter((name) => name.endsWith('.yaml'))
  for (const name of files) {
    const result = spawnSync(
      join(apiDir, 'node_modules/.bin/redocly'),
      [
        'bundle',
        join(apiDir, 'openapi', name),
        '--dereferenced',
        '-o',
        join(out, name.replace(/\.yaml$/, '.json')),
        '--ext',
        'json',
      ],
      { cwd: apiDir, stdio: 'inherit' },
    )
    if (result.status !== 0) throw new Error('Не удалось упаковать контракт')
  }
  await mkdir(join(appDir, 'dist/contracts'), { recursive: true })
  for (const name of ['openapi', 'openapi-shared', 'operational']) {
    await cp(join(apiDir, name), join(appDir, 'dist/contracts', name), { recursive: true })
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await prepareOpenApi()
