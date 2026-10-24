import { useNavigate } from 'react-router-dom'
import { useSessionStore } from '@/stores/sessionStore'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { useAllMemberships } from '@/hooks/useMemberships'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { ROLE_LABEL } from '@/utils/roleLabels'

export function LoginPage() {
  const signInAsCustom = useSessionStore((s) => s.signInAsCustom)
  const resetOnboarding = useOnboardingStore((s) => s.reset)
  const { data: members, isLoading } = useAllMemberships()
  const navigate = useNavigate()

  function onSelect(member: NonNullable<typeof members>[number]) {
    signInAsCustom({
      id: member.id,
      displayName: member.displayName,
      scope: member.scope,
      role: member.role,
      partnerId: member.partnerId ?? undefined,
    })
    navigate(member.scope === 'internal' ? '/admin' : '/dashboard')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bee-bg-primary px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex size-12 items-center justify-center rounded-bee-lg bg-bee-brand-primary text-headline-sm font-medium text-bee-content-primary">
            М
          </span>
          <h1 className="text-headline-sm font-medium text-bee-content-primary">МЁД — Кабинет партнёра</h1>
          <p className="text-body-sm text-bee-content-secondary">
            Демо-вход: реальная авторизация (Mobile ID / SSO) в этом прототипе не подключена.
            Список ниже — все пользователи из демо-хранилища, включая тех, кто прошёл регистрацию.
          </p>
        </div>
        <Card className="flex max-h-[420px] flex-col gap-2 overflow-y-auto p-4">
          {isLoading ? (
            <p className="py-4 text-center text-body-sm text-bee-content-tertiary">Загрузка…</p>
          ) : (
            members?.map((member) => (
              <button
                key={member.id}
                onClick={() => onSelect(member)}
                className="flex items-center justify-between rounded-bee-md border border-bee-border-secondary px-4 py-3 text-left transition-colors hover:border-bee-brand-primary hover:bg-bee-surface-yellow/40"
              >
                <span>
                  <span className="block text-body-sm font-medium text-bee-content-primary">
                    {member.displayName} — {ROLE_LABEL[member.role]}
                  </span>
                  <span className="block text-caption text-bee-content-tertiary">
                    {member.scope === 'internal' ? 'Сотрудник Билайна' : (member.partnerName ?? 'Партнёр')}
                  </span>
                </span>
              </button>
            ))
          )}
        </Card>
        <div className="mt-4 text-center">
          <Button
            priority="tertiary"
            size="m"
            onClick={() => {
              resetOnboarding()
              navigate('/onboarding/registration')
            }}
          >
            Пройти регистрацию нового партнёра
          </Button>
        </div>
      </div>
    </div>
  )
}
