import { useState } from 'react'
import { Download } from 'lucide-react'
import { useCurrentPartnerId } from '@/hooks/useCurrentPartnerId'
import { useSessionStore } from '@/stores/sessionStore'
import { usePartner } from '@/hooks/usePartners'
import { useEffectiveDocuments, useAcceptances, useAcceptDocument } from '@/hooks/useDocuments'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { StatusPill } from '@/components/StatusPill'
import { useUiStore } from '@/stores/uiStore'
import { downloadText } from '@/utils/downloadText'
import type { Acceptance, DocumentVersion } from '@/mock-api/types'

export function DocumentsPage() {
  const partnerId = useCurrentPartnerId()
  const identity = useSessionStore((s) => s.identity)
  const { data: partner } = usePartner(partnerId)
  const { data: documents } = useEffectiveDocuments()
  const { data: acceptances } = useAcceptances(partnerId)
  const acceptDocument = useAcceptDocument()
  const pushToast = useUiStore((s) => s.pushToast)

  async function onAccept(documentVersionId: string) {
    if (!partnerId || !identity || !partner) return
    await acceptDocument.mutateAsync({
      partnerId,
      documentVersionId,
      signatoryId: identity.id,
      signatoryLabel: identity.displayName,
      authorityRef: partner.signatoryBasis,
    })
    pushToast({ tone: 'success', title: 'Документ принят' })
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-sm font-medium text-bee-content-primary">Документы</h1>
        <p className="mt-1 text-body-sm text-bee-content-secondary">
          Действующие версии и свидетельства акцепта. Принимается только актуальная версия.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {documents?.map((doc) => (
          <DocumentCard
            key={doc.id}
            doc={doc}
            acceptance={acceptances?.find((a) => a.documentVersionId === doc.id)}
            accepting={acceptDocument.isPending}
            onAccept={() => onAccept(doc.id)}
          />
        ))}
      </div>
    </div>
  )
}

function DocumentCard({
  doc,
  acceptance,
  accepting,
  onAccept,
}: {
  doc: DocumentVersion
  acceptance: Acceptance | undefined
  accepting: boolean
  onAccept: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-body-accent-sm font-medium text-bee-content-primary">{doc.title}</p>
          <p className="text-caption text-bee-content-tertiary">версия {doc.version}</p>
        </div>
        <StatusPill tone={acceptance ? 'good' : 'wait'}>{acceptance ? 'Принято' : 'Не принято'}</StatusPill>
      </div>

      <p className="text-body-sm text-bee-content-secondary">{doc.contentSummary}</p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-caption font-medium text-bee-link-primary hover:underline"
        >
          {expanded ? 'Свернуть текст' : 'Читать полный текст'}
        </button>
        <Button
          type="button"
          priority="secondary-on-primary"
          size="m"
          onClick={() => downloadText(`${doc.type}-v${doc.version}.txt`, doc.fullText)}
        >
          <Download size={16} className="mr-1.5" /> Скачать
        </Button>
      </div>

      {expanded && (
        <div className="max-h-96 overflow-y-auto rounded-bee-sm bg-bee-bg-primary p-4 text-body-sm whitespace-pre-line text-bee-content-secondary">
          {doc.fullText}
        </div>
      )}

      {acceptance ? (
        <p className="text-caption text-bee-content-tertiary">
          Принято {acceptance.signatoryLabel} · {new Date(acceptance.acceptedAt).toLocaleString('ru-RU')}
        </p>
      ) : (
        <div className="flex justify-end">
          <Button size="m" loading={accepting} onClick={onAccept}>
            Принять
          </Button>
        </div>
      )}
    </Card>
  )
}
