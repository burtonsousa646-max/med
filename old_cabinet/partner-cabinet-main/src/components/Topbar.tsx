import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Bell, ChevronDown, LogOut, Menu, UserPlus } from 'lucide-react'
import { useSessionStore } from '@/stores/sessionStore'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { useUiStore } from '@/stores/uiStore'
import { useAllMemberships } from '@/hooks/useMemberships'
import { useNotifications } from '@/hooks/useNotifications'
import { useCurrentPartnerId } from '@/hooks/useCurrentPartnerId'
import { ROLE_LABEL } from '@/utils/roleLabels'
import { IconButton } from './Button'
import { AssistantLauncher } from '@/components/assistant/AssistantLauncher'

export function Topbar({ crumb }: { crumb?: string }) {
  const identity = useSessionStore((s) => s.identity)
  const signInAsCustom = useSessionStore((s) => s.signInAsCustom)
  const signOut = useSessionStore((s) => s.signOut)
  const resetOnboarding = useOnboardingStore((s) => s.reset)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const { data: members } = useAllMemberships()
  const partnerId = useCurrentPartnerId()
  const { data: notifications } = useNotifications(partnerId)
  const unreadCount = notifications?.filter((n) => !n.readAt).length ?? 0
  const [pickerOpen, setPickerOpen] = useState(false)
  const navigate = useNavigate()

  // Полная перезагрузка, а не client-side navigate(): identity/onboarding-стор уже
  // синхронно записан в localStorage (zustand persist) до перехода, поэтому новый
  // забут приложения на целевом URL сразу увидит чистое состояние — без гонки с
  // guard'ом CabinetLayout, который клиентский navigate() не гарантированно опережает.
  function onSignOut() {
    setPickerOpen(false)
    signOut()
    window.location.href = '/login'
  }

  function onStartNewPartner() {
    setPickerOpen(false)
    signOut()
    resetOnboarding()
    window.location.href = '/onboarding/registration'
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-bee-border-secondary bg-bee-bg-secondary px-4 sm:px-6">
      <IconButton
        aria-label="Открыть меню"
        icon={<Menu size={18} />}
        priority="tertiary"
        size="m"
        className="lg:hidden"
        onClick={toggleSidebar}
      />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="rounded-bee-pill bg-bee-surface-yellow px-2.5 py-1 text-caption font-medium text-bee-brand-tertiary">
          Демо
        </span>
        {crumb && <span className="truncate text-body-sm text-bee-content-secondary">{crumb}</span>}
      </div>
      <AssistantLauncher />
      <Link
        to="/notifications"
        aria-label="Уведомления"
        className="relative flex size-11 shrink-0 items-center justify-center rounded-bee-pill text-bee-content-primary transition-colors hover:bg-bee-el-secondary"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-bee-error-primary text-[10px] font-medium text-bee-light">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Link>
      <div className="relative">
        <button
          onClick={() => setPickerOpen((v) => !v)}
          className="flex items-center gap-2 rounded-bee-pill border border-bee-border-secondary py-1.5 pr-2 pl-3 text-body-sm hover:bg-bee-el-secondary"
        >
          <span className="hidden max-w-[160px] truncate sm:inline">
            {identity?.displayName ?? 'Гость'}
          </span>
          <ChevronDown size={16} />
        </button>
        {pickerOpen && (
          <div className="absolute top-full right-0 z-30 mt-2 w-72 rounded-bee-lg border border-bee-border-secondary bg-bee-bg-secondary p-2 shadow-xl">
            <p className="px-2 py-1 text-caption text-bee-content-tertiary">
              Переключить демо-роль
            </p>
            {members?.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  signInAsCustom({
                    id: m.id,
                    displayName: m.displayName,
                    scope: m.scope,
                    role: m.role,
                    partnerId: m.partnerId ?? undefined,
                  })
                  setPickerOpen(false)
                  navigate(m.scope === 'internal' ? '/admin' : '/dashboard')
                }}
                className="flex w-full items-center justify-between rounded-bee-sm px-2 py-2 text-left text-body-sm hover:bg-bee-el-secondary"
              >
                <span>
                  {m.displayName} — {ROLE_LABEL[m.role]}
                </span>
                {identity?.id === m.id && (
                  <span className="text-caption text-bee-success-tertiary">выбрано</span>
                )}
              </button>
            ))}
            <div className="my-1 border-t border-bee-border-secondary" />
            <button
              onClick={onStartNewPartner}
              className="flex w-full items-center gap-2 rounded-bee-sm px-2 py-2 text-left text-body-sm text-bee-content-primary hover:bg-bee-el-secondary"
            >
              <UserPlus size={16} /> Зарегистрировать нового партнёра
            </button>
            <button
              onClick={onSignOut}
              className="flex w-full items-center gap-2 rounded-bee-sm px-2 py-2 text-left text-body-sm text-bee-error-tertiary hover:bg-bee-el-secondary"
            >
              <LogOut size={16} /> Выйти
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
