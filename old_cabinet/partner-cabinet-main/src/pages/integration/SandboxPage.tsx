import { useState } from 'react'
import { useCurrentPartnerId } from '@/hooks/useCurrentPartnerId'
import { useIntegration, useSandboxRuns, useStartSandboxTest, useCompleteSandboxTest } from '@/hooks/useIntegration'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { StatusPill } from '@/components/StatusPill'
import { EmptyState } from '@/components/EmptyState'
import { LinkButton } from '@/components/LinkButton'

const SCENARIOS = [
  'Обычный сценарий: создание → confirm → fulfil',
  'Повтор команды с тем же Idempotency-Key',
  'Заказ вне очереди (out-of-order event)',
  'Истечение времени callback',
]

const RESULT_TONE = { running: 'wait', passed: 'good', failed: 'bad' } as const
const RESULT_LABEL = { running: 'Выполняется', passed: 'Пройден', failed: 'Ошибка' } as const

export function SandboxPage() {
  const partnerId = useCurrentPartnerId()
  const { data: integration } = useIntegration(partnerId)
  const { data: runs } = useSandboxRuns(integration?.id)
  const startTest = useStartSandboxTest()
  const completeTest = useCompleteSandboxTest()
  const [scenario, setScenario] = useState(SCENARIOS[0]);
  const [runningId, setRunningId] = useState<string | null>(null)

  if (!integration) {
    return (
      <Card>
        <EmptyState
          title="Интеграция ещё не настроена"
          description="Заполните раздел «Интеграция», чтобы открыть sandbox-прогоны."
          action={<LinkButton to="/integration">Перейти к интеграции</LinkButton>}
        />
      </Card>
    )
  }

  async function onRun() {
    const run = await startTest.mutateAsync({ integrationId: integration!.id, scenario })
    setRunningId(run.id)
    setTimeout(async () => {
      await completeTest.mutateAsync({ runId: run.id, passed: !scenario.includes('Истечение') })
      setRunningId(null)
    }, 1200)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-sm font-medium text-bee-content-primary">Sandbox</h1>
        <p className="mt-1 text-body-sm text-bee-content-secondary">
          Тестовые сценарии без реальных платежей и ПДн. UI «тест пройден» не authoritative — прогон логируется.
        </p>
      </div>

      <Card className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-body-accent-sm font-medium text-bee-content-primary">
            Уровень {integration.level} · {integration.connector}
          </span>
          <StatusPill tone={integration.lifecycleStatus === 'active' ? 'good' : 'wait'}>
            {integration.lifecycleStatus}
          </StatusPill>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-body-accent-sm font-medium text-bee-content-primary">
            Сценарий
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-bee-md border border-bee-border-secondary bg-bee-bg-secondary px-3.5 text-body-sm font-normal focus:outline-none focus:ring-2 focus:ring-bee-brand-tertiary"
            >
              {SCENARIOS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <Button loading={startTest.isPending || !!runningId} onClick={onRun}>
            Запустить прогон
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-body-accent-sm font-medium text-bee-content-primary">История прогонов</h2>
        {runs && runs.length > 0 ? (
          <ul className="flex flex-col gap-4">
            {runs.map((run) => (
              <li key={run.id} className="border-b border-bee-border-secondary pb-4 last:border-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <span className="text-body-sm font-medium text-bee-content-primary">{run.scenario}</span>
                  <StatusPill tone={RESULT_TONE[run.result]}>{RESULT_LABEL[run.result]}</StatusPill>
                </div>
                <ul className="mt-2 flex flex-col gap-1">
                  {run.events.map((e, i) => (
                    <li key={i} className="text-caption text-bee-content-tertiary">
                      · {e}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-sm text-bee-content-tertiary">Прогонов пока не было.</p>
        )}
      </Card>
    </div>
  )
}
