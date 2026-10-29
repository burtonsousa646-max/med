// Периодические задачи воркера. Модуль регистрирует: every(600_000, 'bank.poll', fn); воркер вызывает runDue().
// ponytail: время последнего запуска — в памяти воркера; при нескольких воркерах — advisory lock на задачу
const tasks: { name: string; everyMs: number; fn: () => Promise<void>; last: number }[] = []

export function every(everyMs: number, name: string, fn: () => Promise<void>) {
  tasks.push({ name, everyMs, fn, last: 0 })
}

export async function runDue(now = Date.now()) {
  for (const t of tasks.filter(t => now - t.last >= t.everyMs)) {
    t.last = now
    await t.fn().catch(e => console.error(`задача ${t.name}`, e))
  }
}
