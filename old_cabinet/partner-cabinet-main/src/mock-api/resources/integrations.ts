import { db, persist } from '../db'
import { networkLatency, apiError } from '../client'
import { integrationLifecycle } from '../state-machines/integrationLifecycle'
import type { Integration, IntegrationLevel, SandboxTestRun } from '../types'
import { logEvent } from './events'

export async function getIntegration(partnerId: string): Promise<Integration | undefined> {
  await networkLatency()
  return db.integrations.find((i) => i.partnerId === partnerId)
}

export interface ConfigureIntegrationInput {
  partnerId: string
  level: IntegrationLevel
  connector: string
  notes: string
}

export async function configureIntegration(input: ConfigureIntegrationInput): Promise<Integration> {
  await networkLatency()
  let integration = db.integrations.find((i) => i.partnerId === input.partnerId)
  const now = new Date().toISOString()

  if (!integration) {
    integration = {
      id: `int-${crypto.randomUUID().slice(0, 8)}`,
      partnerId: input.partnerId,
      level: input.level,
      connector: input.connector,
      environment: 'sandbox',
      lifecycleStatus: 'not_configured',
      notes: input.notes,
      updatedAt: now,
    }
    db.integrations.push(integration)
  } else {
    integration.level = input.level
    integration.connector = input.connector
    integration.notes = input.notes
  }

  if (integrationLifecycle.canTransition(integration.lifecycleStatus, 'configure')) {
    integration.lifecycleStatus = integrationLifecycle.nextState(integration.lifecycleStatus, 'configure')
  }
  integration.updatedAt = now
  logEvent({
    type: 'integration.configured',
    actorId: 'system',
    actorLabel: 'Партнёр',
    partnerId: input.partnerId,
    entityType: 'integration',
    entityId: integration.id,
    summary: `Интеграция настроена: уровень ${input.level}, коннектор «${input.connector}»`,
  })
  persist()
  return integration
}

export async function startSandboxTest(integrationId: string, scenario: string): Promise<SandboxTestRun> {
  await networkLatency()
  const integration = db.integrations.find((i) => i.id === integrationId)
  if (!integration) throw apiError('NOT_FOUND', 'Интеграция не найдена')

  if (integrationLifecycle.canTransition(integration.lifecycleStatus, 'start_test')) {
    integration.lifecycleStatus = integrationLifecycle.nextState(integration.lifecycleStatus, 'start_test')
  }

  const run: SandboxTestRun = {
    id: `run-${crypto.randomUUID().slice(0, 8)}`,
    integrationId,
    scenario,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    result: 'running',
    events: [`Сценарий «${scenario}» запущен`],
  }
  db.sandboxTestRuns.push(run)
  persist()
  return run
}

/** Демо-имитация исполнения sandbox-сценария: детерминированно проходит через
 *  типовые шаги (create → duplicate → out-of-order → cancel) и завершает прогон. */
export async function completeSandboxTest(runId: string, passed: boolean): Promise<SandboxTestRun> {
  await networkLatency()
  const run = db.sandboxTestRuns.find((r) => r.id === runId)
  if (!run) throw apiError('NOT_FOUND', 'Прогон не найден')

  run.events.push(
    'Создание тестового заказа — OK',
    'Повторная команда с тем же Idempotency-Key — возвращён исходный ответ',
    passed ? 'Обработка callback — OK' : 'Обработка callback — таймаут, требуется повтор',
  )
  run.result = passed ? 'passed' : 'failed'
  run.finishedAt = new Date().toISOString()

  const integration = db.integrations.find((i) => i.id === run.integrationId)
  if (integration) {
    const action = passed ? 'pass' : 'fail'
    if (integrationLifecycle.canTransition(integration.lifecycleStatus, action)) {
      integration.lifecycleStatus = integrationLifecycle.nextState(integration.lifecycleStatus, action)
    }
    integration.updatedAt = new Date().toISOString()
  }
  persist()
  return run
}

export async function listSandboxRuns(integrationId: string): Promise<SandboxTestRun[]> {
  await networkLatency()
  return db.sandboxTestRuns
    .filter((r) => r.integrationId === integrationId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}
