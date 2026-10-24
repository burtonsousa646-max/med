import { Suspense } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { Stepper, type StepDef } from '@/components/Stepper'
import { PageLoading } from '@/components/PageLoading'
import { AssistantLauncher } from '@/components/assistant/AssistantLauncher'

const STEPS: StepDef[] = [
  { key: 'registration', label: 'Регистрация' },
  { key: 'organization', label: 'Организация' },
  { key: 'verification', label: 'Проверка' },
  { key: 'agreement', label: 'Оферта' },
  { key: 'brand', label: 'Бренд' },
  { key: 'first-offer', label: 'Создание предложения' },
  { key: 'integration', label: 'Интеграция' },
]

export function OnboardingLayout() {
  const location = useLocation()
  const activeKey = STEPS.find((s) => location.pathname.endsWith(s.key))?.key ?? 'registration'
  const activeIndex = STEPS.findIndex((s) => s.key === activeKey)
  const doneKeys = STEPS.slice(0, activeIndex).map((s) => s.key)

  return (
    <div className="min-h-screen bg-bee-bg-primary">
      <header className="border-b border-bee-border-secondary bg-bee-bg-secondary px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Link to="/" aria-label="На главную страницу МЁД" className="flex items-center gap-3 hover:opacity-80">
            <span className="flex size-9 items-center justify-center rounded-bee-md bg-bee-brand-primary text-body-accent-md font-medium text-bee-content-primary">
              М
            </span>
            <div>
              <p className="text-body-accent-sm font-medium text-bee-content-primary">МЁД</p>
              <p className="text-caption text-bee-content-tertiary">Подключение партнёра · демо</p>
            </div>
          </Link>
          <div className="flex items-center gap-4">
            <AssistantLauncher />
            <Link
              to="/login"
              className="hidden items-center gap-1.5 text-caption text-bee-content-tertiary hover:text-bee-content-primary sm:flex"
              title="Прогресс мастера сохранится — можно вернуться на эту страницу позже"
            >
              <LogIn size={14} /> Войти под другой ролью (для КАМ/модератора)
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
        <div className="mb-8">
          <Stepper steps={STEPS} activeKey={activeKey} doneKeys={doneKeys} />
        </div>
        <Suspense fallback={<PageLoading />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  )
}
