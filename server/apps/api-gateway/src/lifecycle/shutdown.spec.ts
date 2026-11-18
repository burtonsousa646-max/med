import { HealthState } from '@platform/health'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RequestScope } from '../grpc'
import { ShutdownCoordinator } from './shutdown.ts'

// Восстанавливаем системные таймеры после теста с виртуальным временем.
afterEach(() => vi.useRealTimers())
describe('ShutdownCoordinator', () => {
  // Повторный сигнал присоединяется к одной остановке; ресурсы закрываются после drain.

  it('K10: снимает готовность, ждёт активный запрос и закрывает ресурсы один раз', async () => {
    const state = new HealthState('test')
    state.markReady()
    const close = vi.fn(async () => {})
    const coordinator = new ShutdownCoordinator(state, 1000, close)
    const scope = new RequestScope(1000)
    coordinator.active.add(scope)
    const pending = coordinator.stop()
    expect(state.isReady()).toBe(false)
    expect(coordinator.stop()).toBe(pending)
    expect(close).not.toHaveBeenCalled()
    coordinator.complete(scope)
    await pending
    expect(close).toHaveBeenCalledOnce()
  })

  // По исчерпании общего бюджета остановки оставшиеся вызовы отменяются.
  it('K10: исчерпание бюджета отменяет остаток', async () => {
    vi.useFakeTimers()
    const state = new HealthState('test')
    const coordinator = new ShutdownCoordinator(state, 10, async () => {})
    const scope = new RequestScope(1000)
    coordinator.active.add(scope)
    const pending = coordinator.stop()
    const assertion = expect(pending).rejects.toThrow('остановки')
    await vi.advanceTimersByTimeAsync(11)
    await assertion
    expect(scope.signal.aborted).toBe(true)
    coordinator.complete(scope)
  })
})
