import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { usePartner, useCheckRequests } from '@/hooks/usePartners'
import { useCountdown } from '@/hooks/useCountdown'
import { AUTO_APPROVE_DELAY_MS } from '@/mock-api/resources/partners'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { StatusPill } from '@/components/StatusPill'
import { EmptyState } from '@/components/EmptyState'

const STATUS_TONE = {
  pending: 'wait',
  needs_info: 'bad',
  approved: 'good',
  rejected: 'bad',
} as const

const STATUS_LABEL = {
  pending: 'На проверке',
  needs_info: 'Нужны уточнения',
  approved: 'Проверка пройдена',
  rejected: 'Отклонено',
} as const

export function VerificationPage() {
  const navigate = useNavigate()
  const draftPartnerId = useOnboardingStore((s) => s.draftPartnerId)
  const { data: partner } = usePartner(draftPartnerId ?? undefined)
  const { data: checks } = useCheckRequests(draftPartnerId ?? undefined)
  const latestCheck = checks?.[0]
  const secondsLeft = useCountdown(
    latestCheck?.status === 'pending' ? latestCheck.createdAt : undefined,
    AUTO_APPROVE_DELAY_MS,
  )

  if (!draftPartnerId || !partner) {
    return (
      <Card>
        <EmptyState
          title="Сначала заполните организацию"
          description="Проверка появится после отправки анкеты организации."
          action={
            <Button onClick={() => navigate('/onboarding/organization')}>Перейти к организации</Button>
          }
        />
      </Card>
    )
  }

  const canContinue = partner.lifecycleStatus === 'approved' || partner.lifecycleStatus === 'active'

  return (
    <Card className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-sm font-medium text-bee-content-primary">Проверка</h1>
        <p className="mt-1 text-body-sm text-bee-content-secondary">
          Для большинства категорий риска проверка завершается автоматически. Партнёр не подтверждает
          риск самостоятельно — решение принимает система или ответственный сотрудник Билайна.
        </p>
      </div>

      {latestCheck ? (
        <div className="flex flex-col gap-3 rounded-bee-lg border border-bee-border-secondary p-4">
          <div className="flex items-center justify-between">
            <span className="text-body-accent-sm font-medium text-bee-content-primary">{partner.legalName}</span>
            <StatusPill tone={STATUS_TONE[latestCheck.status]}>{STATUS_LABEL[latestCheck.status]}</StatusPill>
          </div>
          {latestCheck.status === 'pending' && (
            <div className="flex items-center gap-2 text-body-sm text-bee-content-secondary">
              <Loader2 size={16} className="animate-spin text-bee-content-tertiary" />
              {secondsLeft > 0
                ? `Автоматическая проверка завершится примерно через ${secondsLeft} с`
                : 'Завершаем проверку…'}
            </div>
          )}
          {latestCheck.reviewerLabel && (
            <p className="text-caption text-bee-content-tertiary">Решение: {latestCheck.reviewerLabel}</p>
          )}
          {latestCheck.reason && (
            <p className="text-body-sm text-bee-content-secondary">Комментарий: {latestCheck.reason}</p>
          )}
          <p className="text-caption text-bee-content-tertiary">
            Заявка создана {new Date(latestCheck.createdAt).toLocaleString('ru-RU')}
          </p>
        </div>
      ) : (
        <EmptyState title="Заявка на проверку ещё не создана" />
      )}

      <div className="rounded-bee-md bg-bee-surface-blue/40 p-4 text-caption text-bee-content-secondary">
        Хотите посмотреть ручное решение сотрудника? Переключите роль на «Дмитрий Носов — КАМ» через меню входа
        и обработайте заявку в разделе «Партнёры» внутренней админки — до истечения таймера выше.
      </div>

      <div className="flex justify-end">
        <Button disabled={!canContinue} onClick={() => navigate('/onboarding/agreement')}>
          Продолжить
        </Button>
      </div>
    </Card>
  )
}
