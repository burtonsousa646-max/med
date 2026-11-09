import { DatabaseSync, backup } from 'node:sqlite'
import { closeSync, openSync, unlinkSync } from 'node:fs'

const source = process.env.DB_PATH
const destination = process.argv[2]
if (!source || !destination) throw new Error('Set DB_PATH and pass the backup destination as an argument.')

const database = new DatabaseSync(source, { readOnly: true })
let created = false
try {
  // Refuse to overwrite any existing file, including the source database.
  closeSync(openSync(destination, 'wx', 0o600))
  created = true
  await backup(database, destination)
  // A portable backup must open from a read-only mount without WAL sidecars.
  const portable = new DatabaseSync(destination)
  try { portable.exec('pragma journal_mode=delete') } finally { portable.close() }
  console.log('SQLite backup created.')
} catch (error) {
  if (created) unlinkSync(destination)
  throw error
} finally {
  database.close()
}
