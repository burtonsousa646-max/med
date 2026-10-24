import { useState } from 'react'
import { useCurrentPartnerId } from '@/hooks/useCurrentPartnerId'
import { useSessionStore } from '@/stores/sessionStore'
import { useCases, useMessages, useCreateCase, usePostMessage } from '@/hooks/useSupport'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { StatusPill } from '@/components/StatusPill'
import { TextField, TextareaField } from '@/components/form/Field'
import { EmptyState } from '@/components/EmptyState'
import clsx from 'clsx'

const STATUS_TONE = { open: 'wait', in_progress: 'info', resolved: 'good' } as const
const STATUS_LABEL = { open: 'Открыто', in_progress: 'В работе', resolved: 'Решено' } as const

export function SupportPage() {
  const partnerId = useCurrentPartnerId()
  const identity = useSessionStore((s) => s.identity)
  const { data: cases, isLoading } = useCases(partnerId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { data: messages } = useMessages(selectedId ?? undefined)
  const createCase = useCreateCase()
  const postMessage = usePostMessage()

  const [modalOpen, setModalOpen] = useState(false)
  const [topic, setTopic] = useState('')
  const [text, setText] = useState('')
  const [reply, setReply] = useState('')

  const selected = cases?.find((c) => c.id === selectedId) ?? null

  async function onCreate() {
    if (!partnerId || !identity || !topic.trim() || !text.trim()) return
    const created = await createCase.mutateAsync({
      partnerId,
      topic: topic.trim(),
      message: text.trim(),
      authorLabel: identity.displayName,
    })
    setModalOpen(false)
    setTopic('')
    setText('')
    setSelectedId(created.id)
  }

  async function onReply() {
    if (!selected || !identity || !reply.trim()) return
    await postMessage.mutateAsync({ caseId: selected.id, text: reply.trim(), authorLabel: identity.displayName, authorSide: 'partner' })
    setReply('')
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-headline-sm font-medium text-bee-content-primary">Поддержка</h1>
          <p className="mt-1 text-body-sm text-bee-content-secondary">Обращения и переписка с КАМ. История сообщений сохраняется.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>Новое обращение</Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="p-0">
          {isLoading ? (
            <div className="p-6 text-body-sm text-bee-content-tertiary">Загрузка…</div>
          ) : !cases || cases.length === 0 ? (
            <div className="p-6">
              <EmptyState title="Обращений пока нет" />
            </div>
          ) : (
            <ul>
              {cases.map((c) => (
                <li key={c.id} className="border-b border-bee-border-secondary last:border-0">
                  <button
                    onClick={() => setSelectedId(c.id)}
                    className={clsx(
                      'flex w-full flex-col items-start gap-1 p-4 text-left hover:bg-bee-el-secondary',
                      selectedId === c.id && 'bg-bee-surface-yellow/40',
                    )}
                  >
                    <span className="text-body-sm font-medium text-bee-content-primary">{c.topic}</span>
                    <StatusPill tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</StatusPill>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex min-h-[300px] flex-col gap-4">
          {!selected ? (
            <EmptyState title="Выберите обращение" description="Список слева, переписка справа." />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-body-accent-sm font-medium text-bee-content-primary">{selected.topic}</h2>
                <StatusPill tone={STATUS_TONE[selected.status]}>{STATUS_LABEL[selected.status]}</StatusPill>
              </div>
              <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
                {messages?.map((m) => (
                  <div
                    key={m.id}
                    className={clsx(
                      'max-w-[80%] rounded-bee-md p-3 text-body-sm',
                      m.authorSide === 'partner' ? 'self-end bg-bee-surface-yellow/50' : 'self-start bg-bee-el-secondary',
                    )}
                  >
                    <p className="text-bee-content-primary">{m.text}</p>
                    <p className="mt-1 text-caption text-bee-content-tertiary">
                      {m.authorLabel} · {new Date(m.createdAt).toLocaleString('ru-RU')}
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onReply()}
                  placeholder="Ответить…"
                  className="h-11 flex-1 rounded-bee-pill border border-bee-border-secondary bg-bee-bg-secondary px-4 text-body-sm focus:outline-none focus:ring-2 focus:ring-bee-brand-tertiary"
                />
                <Button size="m" disabled={!reply.trim()} loading={postMessage.isPending} onClick={onReply}>
                  Отправить
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Новое обращение"
        footer={
          <>
            <Button priority="secondary-on-primary" onClick={() => setModalOpen(false)}>
              Отмена
            </Button>
            <Button disabled={!topic.trim() || !text.trim()} loading={createCase.isPending} onClick={onCreate}>
              Создать
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <TextField label="Тема" value={topic} onChange={(e) => setTopic(e.target.value)} />
          <TextareaField label="Сообщение" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      </Modal>
    </div>
  )
}
