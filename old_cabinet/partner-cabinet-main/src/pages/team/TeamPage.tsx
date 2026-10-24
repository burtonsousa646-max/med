import { useState } from 'react'
import { useCurrentPartnerId } from '@/hooks/useCurrentPartnerId'
import { useMemberships, useInviteMember, useBlockMember, useUnblockMember } from '@/hooks/useMemberships'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { StatusPill } from '@/components/StatusPill'
import { SelectField, TextField } from '@/components/form/Field'
import { EmptyState } from '@/components/EmptyState'
import { useUiStore } from '@/stores/uiStore'
import type { PartnerRole } from '@/types/session'

const ROLE_OPTIONS: Array<{ value: PartnerRole; label: string }> = [
  { value: 'owner', label: 'Владелец' },
  { value: 'offer_editor', label: 'Редактор офферов' },
  { value: 'orders_ops', label: 'Заказы' },
  { value: 'finance', label: 'Финансы' },
  { value: 'developer', label: 'Разработчик' },
  { value: 'viewer', label: 'Наблюдатель' },
]
const ROLE_LABEL = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r.label]))

export function TeamPage() {
  const partnerId = useCurrentPartnerId()
  const { data: members, isLoading } = useMemberships(partnerId)
  const invite = useInviteMember(partnerId)
  const block = useBlockMember(partnerId)
  const unblock = useUnblockMember(partnerId)
  const pushToast = useUiStore((s) => s.pushToast)

  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<PartnerRole>('viewer')

  async function onInvite() {
    if (!partnerId || !name.trim() || !email.trim()) return
    await invite.mutateAsync({
      partnerId,
      userId: `u-${crypto.randomUUID().slice(0, 8)}`,
      displayName: name.trim(),
      email: email.trim(),
      scope: 'partner',
      role,
    })
    pushToast({ tone: 'success', title: 'Приглашение отправлено' })
    setModalOpen(false)
    setName('')
    setEmail('')
    setRole('viewer')
  }

  async function onBlockToggle(memberId: string, blocked: boolean) {
    try {
      if (blocked) await unblock.mutateAsync(memberId)
      else await block.mutateAsync(memberId)
    } catch (e) {
      pushToast({ tone: 'error', title: e instanceof Error ? e.message : 'Не удалось выполнить действие' })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-headline-sm font-medium text-bee-content-primary">Команда</h1>
          <p className="mt-1 text-body-sm text-bee-content-secondary">
            Нельзя заблокировать последнего владельца. Блокировка отзывает доступ немедленно.
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>Пригласить</Button>
      </div>

      <Card className="p-0">
        {isLoading ? (
          <div className="p-6 text-body-sm text-bee-content-tertiary">Загрузка…</div>
        ) : !members || members.length === 0 ? (
          <div className="p-6">
            <EmptyState title="В команде пока никого нет" />
          </div>
        ) : (
          <ul>
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-4 border-b border-bee-border-secondary p-4 last:border-0">
                <div>
                  <p className="text-body-sm font-medium text-bee-content-primary">{m.displayName}</p>
                  <p className="text-caption text-bee-content-tertiary">
                    {m.email} · {ROLE_LABEL[m.role] ?? m.role}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusPill tone={m.status === 'active' ? 'good' : 'bad'}>
                    {m.status === 'active' ? 'Активен' : 'Заблокирован'}
                  </StatusPill>
                  <Button
                    priority="secondary-on-primary"
                    size="m"
                    loading={block.isPending || unblock.isPending}
                    onClick={() => onBlockToggle(m.id, m.status === 'blocked')}
                  >
                    {m.status === 'active' ? 'Заблокировать' : 'Разблокировать'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Пригласить в команду"
        footer={
          <>
            <Button priority="secondary-on-primary" onClick={() => setModalOpen(false)}>
              Отмена
            </Button>
            <Button disabled={!name.trim() || !email.trim()} loading={invite.isPending} onClick={onInvite}>
              Пригласить
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <TextField label="Имя" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <SelectField
            label="Роль"
            options={ROLE_OPTIONS}
            value={role}
            onChange={(e) => setRole(e.target.value as PartnerRole)}
          />
        </div>
      </Modal>
    </div>
  )
}
