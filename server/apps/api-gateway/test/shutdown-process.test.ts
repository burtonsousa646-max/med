import { fork, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { request } from 'node:http'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it, vi } from 'vitest'

let child: ChildProcess | undefined

/** Ожидает событие тестового процесса и отклоняет ожидание при его выходе. */
function waitForEvent(
  processUnderTest: ChildProcess,
  expected: string,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    /** Отписывает обработчики после результата ожидания. */
    const cleanup = () => {
      processUnderTest.off('message', onMessage)
      processUnderTest.off('exit', onExit)
    }

    /** Находит событие с ожидаемым именем. */
    const onMessage = (message: unknown) => {
      if (
        !message ||
        typeof message !== 'object' ||
        !('event' in message) ||
        message.event !== expected
      )
        return
      cleanup()
      resolve(message)
    }

    /** Сообщает о преждевременном завершении процесса. */
    const onExit = () => {
      cleanup()
      reject(new Error(`Процесс завершился до события ${expected}`))
    }

    processUnderTest.on('message', onMessage)
    processUnderTest.once('exit', onExit)
  })
}

describe('K10: остановка отдельного процесса gateway', () => {
  afterAll(() => {
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  })

  it('снимает readiness до дренирования и остаётся live до завершения запроса', async () => {
    child = fork(fileURLToPath(new URL('./fixtures/shutdown-server.mjs', import.meta.url)), [], {
      execPath: process.execPath,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    })
    const ready = await waitForEvent(child, 'ready')
    expect(typeof ready['base']).toBe('string')
    const base = String(ready['base'])
    const started = waitForEvent(child, 'started')
    const outgoing = request(`${base}/api/shutdown/v1/hold`)

    // Сокет закрывается тестом после проверки состояния процесса.
    outgoing.on('error', () => {})
    outgoing.end()
    await started
    const stopping = waitForEvent(child, 'stopping')
    const exit = once(child, 'exit')
    child.kill('SIGTERM')
    await stopping
    child.kill('SIGTERM')

    await vi.waitFor(async () => {
      expect((await fetch(`${base}/health/ready`)).status).toBe(503)
    })
    expect((await fetch(`${base}/health/live`)).status).toBe(200)
    expect((await fetch(`${base}/api/shutdown/v1/hold`)).status).toBe(503)

    outgoing.destroy()
    const [code] = (await exit) as [number | null, string | null]
    expect(code).toBe(0)
  })

  it('отменяет зависший запрос и завершает процесс в пределах бюджета остановки', async () => {
    child = fork(fileURLToPath(new URL('./fixtures/shutdown-server.mjs', import.meta.url)), [], {
      execPath: process.execPath,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    })
    const ready = await waitForEvent(child, 'ready')
    const started = waitForEvent(child, 'started')
    const outgoing = request(`${String(ready['base'])}/api/shutdown/v1/hold`)

    outgoing.on('error', () => {})
    outgoing.end()
    await started
    const exit = once(child, 'exit')
    const start = performance.now()
    child.kill('SIGTERM')

    const [code] = (await exit) as [number | null, string | null]
    const elapsed = performance.now() - start
    outgoing.destroy()
    expect(code).toBe(1)
    expect(elapsed).toBeLessThan(4000)
  }, 7000)
})
