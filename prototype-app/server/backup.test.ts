import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

test('backup includes live WAL data and never overwrites an existing database', () => {
  const folder = mkdtempSync(join(tmpdir(), 'med-backup-'))
  const source = join(folder, 'source.sqlite')
  const destination = join(folder, 'backup.sqlite')
  const database = new DatabaseSync(source)
  try {
    database.exec("pragma journal_mode=wal; create table data (value text); insert into data values ('saved');")
    const run = (target: string) => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', new URL('./backup.ts', import.meta.url).pathname, target], { env: { ...process.env, DB_PATH: source } })
    assert.equal(run(destination).status, 0)
    assert.equal(statSync(destination).mode & 0o777, 0o600)
    const copied = new DatabaseSync(destination, { readOnly: true })
    try {
      assert.equal(copied.prepare('select value from data').get()!.value, 'saved')
      assert.equal(copied.prepare('pragma integrity_check').get()!.integrity_check, 'ok')
      assert.equal(copied.prepare('pragma journal_mode').get()!.journal_mode, 'delete')
    } finally { copied.close() }
    assert.notEqual(run(destination).status, 0)
    assert.notEqual(run(source).status, 0)
    assert.equal(database.prepare('select value from data').get()!.value, 'saved')
  } finally {
    database.close()
    rmSync(folder, { recursive: true, force: true })
  }
})
