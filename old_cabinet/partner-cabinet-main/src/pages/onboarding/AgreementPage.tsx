import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download } from 'lucide-react'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { usePartner } from '@/hooks/usePartners'
import { useAcceptDocument, useAcceptances, useEffectiveDocuments } from '@/hooks/useDocuments'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { CheckboxField } from '@/components/form/Field'
import { EmptyState } from '@/components/EmptyState'
import { useUiStore } from '@/stores/uiStore'
import { downloadText } from '@/utils/downloadText'

export function AgreementPage() {
  const navigate = useNavigate()
  const draftPartnerId = useOnboardingStore((s) => s.draftPartnerId)
  const contact = useOnboardingStore((s) => s.contact)
  const { data: partner } = usePartner(draftPartnerId ?? undefined)
  const { data: documents } = useEffectiveDocuments('offer_agreement')
  const { data: acceptances } = useAcceptances(draftPartnerId ?? undefined)
  const acceptDocument = useAcceptDocument()
  const pushToast = useUiStore((s) => s.pushToast)
  const [read, setRead] = useState(false)
  const [agree, setAgree] = useState(false)

  const effectiveDoc = documents?.[0]
  const alreadyAccepted = acceptances?.some((a) => a.documentVersionId === effectiveDoc?.id)

  if (!draftPartnerId || !partner) {
    return (
      <Card>
        <EmptyState
          title="Сначала заполните организацию"
          action={<Button onClick={() => navigate('/onboarding/organization')}>Перейти к организации</Button>}
        />
      </Card>
    )
  }

  async function onAccept() {
    if (!effectiveDoc || !contact) return
    await acceptDocument.mutateAsync({
      partnerId: draftPartnerId!,
      documentVersionId: effectiveDoc.id,
      signatoryId: `u-${draftPartnerId}-signatory`,
      signatoryLabel: `${contact.lastName} ${contact.firstName}`,
      authorityRef: partner!.signatoryBasis,
    })
    pushToast({ tone: 'success', title: 'Оферта принята' })
    navigate('/onboarding/brand')
  }

  return (
    <Card className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-sm font-medium text-bee-content-primary">Оферта на доступ к платформе</h1>
        <p className="mt-1 text-body-sm text-bee-content-secondary">
          Единая рамочная оферта открывает доступ к личному кабинету МЁД. Коммерческие условия по каждому предложению
          согласуются отдельно и появляются в кабинете после подключения.
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-bee-lg bg-bee-surface-yellow/40 p-4 text-body-sm text-bee-content-secondary">
        <p>
          <b className="font-medium text-bee-content-primary">Коммерческие условия: </b>
          модель, ставка платформы, скидка для клиента, сроки и территория фиксируются отдельно для каждого согласованного
          оффера.
        </p>
        <p>
          <b className="font-medium text-bee-content-primary">Для брендов с оборотом от 1 млрд ₽ в месяц: </b>
          доступны индивидуальные условия партнёрства. Запрос можно направить в ЛК, согласование проходит через
          персонального менеджера.
        </p>
        <p>
          <b className="font-medium text-bee-content-primary">Важно: </b>
          принятие рамочной оферты само по себе не запускает продажи и не фиксирует единую комиссию для всех партнёров.
        </p>
      </div>

      {effectiveDoc ? (
        <>
          <div className="rounded-bee-lg border border-bee-border-secondary p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-body-accent-sm font-medium text-bee-content-primary">{effectiveDoc.title}</span>
              <div className="flex items-center gap-3">
                <span className="text-caption text-bee-content-tertiary">версия {effectiveDoc.version}</span>
                <a
                  href="/offer"
                  target="_blank"
                  rel="noreferrer"
                  className="text-caption font-medium text-bee-link-primary hover:underline"
                >
                  Открыть на отдельной странице
                </a>
                <Button
                  type="button"
                  priority="secondary-on-primary"
                  size="m"
                  onClick={() => downloadText(`oferta-v${effectiveDoc.version}.txt`, effectiveDoc.fullText)}
                >
                  <Download size={16} className="mr-1.5" /> Скачать
                </Button>
              </div>
            </div>
            <div className="mt-3 max-h-96 overflow-y-auto rounded-bee-sm bg-bee-bg-primary p-4 text-body-sm whitespace-pre-line text-bee-content-secondary">
              {effectiveDoc.fullText}
            </div>
          </div>

          {alreadyAccepted ? (
            <div className="rounded-bee-md bg-bee-surface-green/60 p-4 text-body-sm text-bee-success-tertiary">
              Оферта уже принята {partner.signatoryName ? `(${partner.signatoryName})` : ''}.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <CheckboxField
                label="Я ознакомился(-лась) с рамочной офертой на доступ к платформе"
                checked={read}
                onChange={(e) => setRead(e.target.checked)}
              />
              <CheckboxField
                label="Принимаю условия оферты от имени организации"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
              />
            </div>
          )}
        </>
      ) : (
        <EmptyState title="Действующая версия оферты не найдена" />
      )}

      <div className="flex justify-end gap-3">
        {alreadyAccepted ? (
          <Button onClick={() => navigate('/onboarding/brand')}>Продолжить</Button>
        ) : (
          <Button
            disabled={!read || !agree || !effectiveDoc}
            loading={acceptDocument.isPending}
            onClick={onAccept}
          >
            Принять и продолжить
          </Button>
        )}
      </div>
    </Card>
  )
}
