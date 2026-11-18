// Проверяет жизненный цикл готовности и ответ на неизвестное имя сервиса.
import { expect, it } from 'vitest'
import { GrpcHealthController, HealthState } from './health.ts'
it('K3: готовность не восстанавливается после остановки; неизвестный сервис скрыт', () => {
  const state = new HealthState('test-service')
  const controller = new GrpcHealthController(state)
  expect(controller.check({ service: '' }).status).toBe('NOT_SERVING')
  state.markReady()
  expect(controller.check({ service: 'test-service' }).status).toBe('SERVING')
  expect(() => controller.check({ service: 'other' })).toThrow()
  state.beginShutdown()
  state.markReady()
  expect(state.isReady()).toBe(false)
})
