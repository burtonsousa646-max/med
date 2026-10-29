// Фоновый процесс: исходящая очередь, партиции показов. Модули добавляют сюда свои периодические задачи.
import { sql } from './db.ts'
import { checkPorts } from './integrations/index.ts'
import { runOutbox } from './integrations/outbox.ts'
import './modules.ts'

checkPorts()
let stop = false
process.on('SIGTERM', () => (stop = true))
process.on('SIGINT', () => (stop = true))

let lastPartitions = 0
while (!stop) {
  if (Date.now() - lastPartitions > 3600_000) {
    await sql`select ensure_impression_partitions(7)`
    lastPartitions = Date.now()
  }
  const n = await runOutbox().catch(e => (console.error('outbox', e), 0))
  if (!n) await new Promise(r => setTimeout(r, 1000))
}
await sql.end()
