// Код и контракт не расходятся: каждый маршрут сервера описан в api/*.yaml, и каждая операция контракта реализована.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { parse } from 'yaml'
import { app } from './index.ts'

test('маршруты сервера = операции контрактов', async () => {
  const dir = new URL('../api/', import.meta.url)
  const inContract = new Set<string>()
  for (const f of (await readdir(dir)).filter(f => f.endsWith('.yaml'))) {
    const doc = parse(await readFile(new URL(f, dir), 'utf8'))
    for (const [path, ops] of Object.entries<Record<string, unknown>>(doc.paths ?? {}))
      for (const m of Object.keys(ops).filter(m => ['get', 'post', 'put', 'patch', 'delete'].includes(m))) inContract.add(`${m.toUpperCase()} ${path}`)
  }
  const inCode = new Set(app.routes.filter(r => r.method !== 'ALL')
    .map(r => `${r.method} ${r.path.replace(/^\/api/, '').replace(/:(\w+)/g, '{$1}')}`))
  assert.ok(inCode.size >= 15, 'маршруты не прочитались')
  assert.deepEqual([...inCode].filter(r => !inContract.has(r)), [], 'есть в коде, нет в контракте')
  assert.deepEqual([...inContract].filter(r => !inCode.has(r)), [], 'есть в контракте, нет в коде')
})
