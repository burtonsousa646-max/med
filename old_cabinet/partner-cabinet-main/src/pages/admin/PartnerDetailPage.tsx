import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { usePartner, useCheckRequests, useDecideCheckRequest } from '@/hooks/usePartners'
import { useSessionStore } from '@/stores/sessionStore'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { StatusPill } from '@/components/StatusPill'
import { TextareaField } from '@/components/form/Field'
import { EmptyState } from '@/components/EmptyState'
import type { CheckDecision } from '@/mock-api/resources/partners'

const PARTNER_STATUS_TONE = {
  draft: 'neutral',
  submitted: 'wait',
  checking: 'wait',
  needs_info: 'bad',
  approved: 'good',
  active: 'good',
  suspended: 'bad',
  terminating: 'bad',
  terminated: 'neutral',
  rejected: 'bad',
} as const

const PARTNER_STATUS_LABEL: Record<string, string> = {
  draft: 'Черновик',
  submitted: 'Отправлено',
  checking: 'На проверке',
  needs_info: 'Нужны уточнения',
  approved: 'Проверка пройдена',
  active: 'Активен',
  suspended: 'Приостановлен',
  terminating: 'Завершение сотрудничества',
  terminated: 'Сотрудничество завершено',
  rejected: 'Отклонён',
}

export function PartnerDetailPage() {
  const { partnerId } = useParams<{ partnerId: string }>()
  const identity = useSessionStore((s) => s.identity)
  const { data: partner } = usePartner(partnerId)
  const { data: checks } = useCheckRequests(partnerId)
  const decide = useDecideCheckRequest()
  const [reason, setReason] = useState('')

  const latestCheck = checks?.[0]
  const canDecide = latestCheck && (latestCheck.status === 'pending' || latestCheck.status === 'needs_info')

  if (!partner) {
    return (
      <Card>
        <EmptyState title="Партнёр не найден" />
      </Card>
    )
  }

  async function onDecide(decision: CheckDecision) {
    if (!latestCheck || !identity) return
    if (decision !== 'approve' && !reason.trim()) return
    await decide.mutateAsync({
      checkRequestId: latestCheck.id,
      decision,
      reason: reason.trim() || null,
      reviewerLabel: identity.displayName,
      reviewerId: identity.id,
    })
    setReason('')
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-headline-sm font-medium text-bee-content-primary">{partner.legalName}</h1>
          <p className="text-body-sm text-bee-content-secondary">
            {partner.legalForm} · ИНН {partner.taxId} · ОГРН {partner.ogrn}
          </p>
        </div>
        <StatusPill tone={PARTNER_STATUS_TONE[partner.lifecycleStatus]}>
          {PARTNER_STATUS_LABEL[partner.lifecycleStatus]}
        </StatusPill>
      </div>

      <Card className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Адрес" value={partner.address} />
        <Field label="Подписант" value={`${partner.signatoryName} (${partner.signatoryBasis})`} />
        <Field label="Контакты" value={`${partner.contactEmail} · ${partner.contactPhone}`} />
        <Field label="Уровень риска" value={partner.riskStatus ?? '—'} />
      </Card>

      <Card>
        <h2 className="mb-3 text-body-accent-sm font-medium text-bee-content-primary">История проверки</h2>
        {checks && checks.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {checks.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-4 border-b border-bee-border-secondary pb-3 last:border-0 last:pb-0">
                <div>
                  <p className="text-body-sm text-bee-content-primary">
                    {new Date(c.createdAt).toLocaleString('ru-RU')}
                    {c.reviewerLabel ? ` · решение: ${c.reviewerLabel}` : ''}
                  </p>
                  {c.reason && <p className="text-caption text-bee-content-tertiary">{c.reason}</p>}
                </div>
                <StatusPill tone={PARTNER_STATUS_TONE[c.status as keyof typeof PARTNER_STATUS_TONE] ?? 'neutral'}>
                  {c.status}
                </StatusPill>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-sm text-bee-content-tertiary">Заявок на проверку пока нет.</p>
        )}
      </Card>

      {canDecide && (
        <Card className="flex flex-col gap-4">
          <h2 className="text-body-accent-sm font-medium text-bee-content-primary">Решение по проверке</h2>
          <TextareaField
            label="Комментарий (обязателен для отказа или запроса уточнений)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex flex-wrap gap-3">
            <Button loading={decide.isPending} onClick={() => onDecide('approve')}>
              Одобрить
            </Button>
            <Button
              priority="secondary-on-primary"
              loading={decide.isPending}
              disabled={!reason.trim()}
              onClick={() => onDecide('request_info')}
            >
              Запросить уточнения
            </Button>
            <Button
              priority="destructive"
              loading={decide.isPending}
              disabled={!reason.trim()}
              onClick={() => onDecide('reject')}
            >
              Отклонить
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-caption text-bee-content-tertiary">{label}</p>
      <p className="text-body-sm text-bee-content-primary">{value}</p>
    </div>
  )
}
