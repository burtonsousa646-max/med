import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useCurrentPartnerId } from '@/hooks/useCurrentPartnerId'
import { useOffer, useOfferVersions } from '@/hooks/useOffers'
import { useCodeBatches, useCodes, useCommitCodeBatch } from '@/hooks/useCodeBatches'
import { previewCodes, type CodePreviewRow } from '@/mock-api/resources/codeBatches'
import { Card, MetricTile } from '@/components/Card'
import { Button } from '@/components/Button'
import { TextareaField, TextField } from '@/components/form/Field'
import { StatusPill } from '@/components/StatusPill'
import { EmptyState } from '@/components/EmptyState'
import { useUiStore } from '@/stores/uiStore'

function todayPlusDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function CodeBatchesPage() {
  const { offerId } = useParams<{ offerId: string }>()
  const partnerId = useCurrentPartnerId()
  const { data: offer } = useOffer(offerId)
  const { data: versions } = useOfferVersions(offerId)
  const latestVersion = versions?.[0]
  const { data: batches } = useCodeBatches(latestVersion?.id)
  const commitBatch = useCommitCodeBatch()
  const pushToast = useUiStore((s) => s.pushToast)

  const [raw, setRaw] = useState('')
  const [expiresAt, setExpiresAt] = useState(todayPlusDays(90))
  const [preview, setPreview] = useState<CodePreviewRow[] | null>(null)

  const rows = useMemo(
    () =>
      raw
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    [raw],
  )

  function onPreview() {
    if (!partnerId) return
    setPreview(previewCodes(partnerId, rows))
  }

  async function onCommit() {
    if (!partnerId || !latestVersion || !preview) return
    if (preview.some((r) => r.error)) return
    await commitBatch.mutateAsync({
      offerVersionId: latestVersion.id,
      partnerId,
      codes: preview.map((r) => r.code),
      expiresAt: new Date(expiresAt).toISOString(),
    })
    pushToast({ tone: 'success', title: `Загружено кодов: ${preview.length}` })
    setRaw('')
    setPreview(null)
  }

  if (!offer) return <EmptyState title="Оффер не найден" />

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-sm font-medium text-bee-content-primary">Промокоды — {offer.title}</h1>
        <p className="mt-1 text-body-sm text-bee-content-secondary">
          Загрузите список кодов построчно. Дубли внутри партии и с уже выданными кодами отклоняются до commit.
        </p>
      </div>

      <Card className="flex flex-col gap-4">
        <TextareaField
          label="Коды (по одному в строке)"
          rows={6}
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value)
            setPreview(null)
          }}
          placeholder={'OF-1000\nOF-1001\nOF-1002'}
        />
        <TextField
          label="Срок действия партии"
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
        />
        <div className="flex flex-wrap gap-3">
          <Button priority="secondary-on-primary" disabled={rows.length === 0} onClick={onPreview}>
            Проверить перед загрузкой
          </Button>
          <Button
            disabled={!preview || preview.some((r) => r.error)}
            loading={commitBatch.isPending}
            onClick={onCommit}
          >
            Загрузить {preview ? `(${preview.length})` : ''}
          </Button>
        </div>

        {preview && (
          <div className="rounded-bee-md border border-bee-border-secondary">
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-body-sm">
                <tbody>
                  {preview.map((row) => (
                    <tr key={row.rowNumber} className="border-b border-bee-border-secondary last:border-0">
                      <td className="w-10 px-3 py-2 text-caption text-bee-content-tertiary">{row.rowNumber}</td>
                      <td className="px-3 py-2 font-mono text-bee-content-primary">{row.code}</td>
                      <td className="px-3 py-2 text-right">
                        {row.error ? (
                          <span className="text-caption text-bee-error-tertiary">{row.error}</span>
                        ) : (
                          <span className="text-caption text-bee-success-tertiary">OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      {batches?.map((batch) => (
        <BatchSummary key={batch.id} batchId={batch.id} totalCodes={batch.totalCodes} />
      ))}
    </div>
  )
}

function BatchSummary({ batchId, totalCodes }: { batchId: string; totalCodes: number }) {
  const { data: codes } = useCodes(batchId)
  const counts = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const c of codes ?? []) acc[c.status] = (acc[c.status] ?? 0) + 1
    return acc
  }, [codes])

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-body-accent-sm font-medium text-bee-content-primary">Партия {batchId}</h2>
        <span className="text-caption text-bee-content-tertiary">{totalCodes} кодов</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <MetricTile label="Доступно" value={counts.available ?? 0} />
        <MetricTile label="Выдано" value={counts.issued ?? 0} />
        <MetricTile label="Погашено" value={counts.redeemed ?? 0} />
        <MetricTile label="Истекло" value={counts.expired ?? 0} />
        <MetricTile label="Отозвано" value={counts.revoked ?? 0} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {codes?.slice(0, 12).map((c) => (
          <StatusPill key={c.id} tone={c.status === 'redeemed' || c.status === 'available' ? 'good' : 'neutral'}>
            {c.code}
          </StatusPill>
        ))}
        {codes && codes.length > 12 && (
          <span className="self-center text-caption text-bee-content-tertiary">и ещё {codes.length - 12}</span>
        )}
      </div>
    </Card>
  )
}
