import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkLocalRefs } from '../scripts/prepare-openapi.mjs'

it.each(['https://example.test/schema.yaml', '../outside.yaml', 'file:///tmp/schema.yaml'])(
  'K4: запрещает ссылку %s до bundle и сетевого доступа',
  async (ref) => {
    const folder = await mkdtemp(join(tmpdir(), 'gateway-refs-'))
    try {
      await mkdir(join(folder, 'api'))
      await writeFile(join(folder, 'outside.yaml'), 'type: string')
      await writeFile(join(folder, 'api/input.yaml'), JSON.stringify({ schema: { $ref: ref } }))
      await expect(checkLocalRefs(join(folder, 'api'))).rejects.toThrow()
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  },
)
describe('локальные ссылки OpenAPI', () => {
  it('K4: запрещает сборку, если локальная ссылка отсутствует', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'gateway-missing-ref-'))

    try {
      await writeFile(join(folder, 'input.yaml'), '$ref: missing.yaml')
      await expect(checkLocalRefs(folder)).rejects.toThrow()
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  it('K4: разрешает локальный ref и запрещает симлинк за границу', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'gateway-local-refs-'))

    try {
      const api = join(folder, 'api')
      await mkdir(api)
      await writeFile(join(api, 'schema.yaml'), 'type: string')
      await writeFile(join(api, 'input.yaml'), '$ref: schema.yaml')
      await expect(checkLocalRefs(api)).resolves.toBeUndefined()
      await writeFile(join(folder, 'outside.yaml'), 'type: string')
      await symlink(join(folder, 'outside.yaml'), join(api, 'link.yaml'))
      await writeFile(join(api, 'input.yaml'), '$ref: link.yaml')
      await expect(checkLocalRefs(api)).rejects.toThrow('каталог')
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })
})
