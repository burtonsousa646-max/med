// Фоновый процесс: исходящая очередь и периодические задачи модулей (schedule.ts).
import { sql } from './db.ts'
import { checkPorts } from './integrations/index.ts'
import { runOutbox } from './integrations/outbox.ts'
import { every, runDue } from './schedule.ts'
import './modules.ts'

checkPorts()
every(3600_000, 'impressions.partitions', async () => { await sql`select ensure_impression_partitions(7)` })

let stop = false
process.on('SIGTERM', () => (stop = true))
process.on('SIGINT', () => (stop = true))

while (!stop) {
  await runDue()
  const n = await runOutbox().catch(e => (console.error('outbox', e), 0))
  if (!n) await new Promise(r => setTimeout(r, 1000))
}
await sql.end()
