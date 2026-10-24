import { useState } from 'react'
import { useCurrentPartnerId } from '@/hooks/useCurrentPartnerId'
import { useOutlets, useCreateOutlet, useCloseOutlet } from '@/hooks/useOutlets'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { StatusPill } from '@/components/StatusPill'
import { TextField, CheckboxField } from '@/components/form/Field'
import { EmptyState } from '@/components/EmptyState'
import { useUiStore } from '@/stores/uiStore'

export function OutletsPage() {
  const partnerId = useCurrentPartnerId()
  const { data: outlets, isLoading } = useOutlets(partnerId)
  const createOutlet = useCreateOutlet()
  const closeOutlet = useCloseOutlet(partnerId)
  const pushToast = useUiStore((s) => s.pushToast)

  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [online, setOnline] = useState(true)

  async function onCreate() {
    if (!partnerId || !name.trim()) return
    await createOutlet.mutateAsync({
      partnerId,
      name: name.trim(),
      address: address.trim() || 'Онлайн',
      online,
      timezone: 'Europe/Moscow',
      hours: 'Круглосуточно',
    })
    pushToast({ tone: 'success', title: 'Точка добавлена' })
    setModalOpen(false)
    setName('')
    setAddress('')
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-headline-sm font-medium text-bee-content-primary">Точки</h1>
          <p className="mt-1 text-body-sm text-bee-content-secondary">
            Точки исполнения/продаж. Закрытие точки не удаляет прошлые заказы.
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>Добавить точку</Button>
      </div>

      <Card className="p-0">
        {isLoading ? (
          <div className="p-6 text-body-sm text-bee-content-tertiary">Загрузка…</div>
        ) : !outlets || outlets.length === 0 ? (
          <div className="p-6">
            <EmptyState title="Точек пока нет" />
          </div>
        ) : (
          <ul>
            {outlets.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-4 border-b border-bee-border-secondary p-4 last:border-0">
                <div>
                  <p className="text-body-sm font-medium text-bee-content-primary">{o.name}</p>
                  <p className="text-caption text-bee-content-tertiary">
                    {o.address} · {o.online ? 'Онлайн' : 'Офлайн'} · {o.hours}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusPill tone={o.status === 'active' ? 'good' : 'neutral'}>
                    {o.status === 'active' ? 'Активна' : 'Закрыта'}
                  </StatusPill>
                  {o.status === 'active' && (
                    <Button
                      priority="secondary-on-primary"
                      size="m"
                      loading={closeOutlet.isPending}
                      onClick={() => closeOutlet.mutate(o.id)}
                    >
                      Закрыть
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Новая точка"
        footer={
          <>
            <Button priority="secondary-on-primary" onClick={() => setModalOpen(false)}>
              Отмена
            </Button>
            <Button disabled={!name.trim()} loading={createOutlet.isPending} onClick={onCreate}>
              Добавить
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <TextField label="Название" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label="Адрес" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Онлайн" />
          <CheckboxField label="Онлайн-точка" checked={online} onChange={(e) => setOnline(e.target.checked)} />
        </div>
      </Modal>
    </div>
  )
}
