import { ClientUnaryCall } from '@grpc/grpc-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeError } from '../errors'
import { GrpcCallExecutor, RequestScope } from './executor.ts'
import type { UnaryFactory } from './executor.types.ts'

// Возвращаем реальные таймеры после сценариев с виртуальным временем.
afterEach(() => vi.useRealTimers())
describe('GrpcCallExecutor', () => {
  // Отмена до отправки должна завершить вызов, не создавая gRPC-запрос.

  it('K9: не отправляет отменённый вызов', async () => {
    const scope = new RequestScope(100)
    scope.abort()
    const factory = vi.fn()
    await expect(new GrpcCallExecutor(50).execute(factory, scope)).rejects.toThrow()
    expect(factory).not.toHaveBeenCalled()
  })

  // Проверяем deadline, allowlist metadata и отмену уже отправленного RPC.
  it('K9: ограничивает дедлайн, передаёт только серверный ID и отменяет один вызов', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn()
    const scope = new RequestScope(1000)
    const factory = vi.fn<UnaryFactory<unknown>>((metadata, deadline) => {
      expect(metadata.get('x-request-id')).toEqual([scope.requestId])
      expect(deadline.getTime() - Date.now()).toBeLessThanOrEqual(50)
      return { cancel } as unknown as ClientUnaryCall
    })
    const pending = new GrpcCallExecutor(50).execute(factory, scope)
    const assertion = expect(pending).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(51)
    await assertion
    expect(cancel).toHaveBeenCalledOnce()
    expect(factory).toHaveBeenCalledOnce()
  })

  // Ошибка upstream не должна раскрывать исходное сообщение клиенту.
  it('K7: скрывает сырые сообщения upstream', () => {
    expect(normalizeError({ code: 14, message: 'synthetic-password' })).toEqual({
      status: 503,
      body: { code: 'service_unavailable', message: 'Сервис временно недоступен' },
    })
  })
})
