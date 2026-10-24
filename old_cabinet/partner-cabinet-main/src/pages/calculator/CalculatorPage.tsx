import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ShoppingCart } from 'lucide-react'
import clsx from 'clsx'
import { LinkButton } from '@/components/LinkButton'
import { AssistantLauncher } from '@/components/assistant/AssistantLauncher'
import { MedWidgetDemo } from '@/components/widget/MedWidgetDemo'
import { CALC_SERVICES, rub, serviceWord, type CalcServiceId } from '@/content/calculatorServices'

type Values = Record<CalcServiceId, Record<string, number>>

const initialValues = (): Values =>
  Object.fromEntries(CALC_SERVICES.map((s) => [s.id, { ...s.defaults }])) as Values

/** Публичный калькулятор-корзина: партнёр добавляет нужные модели и виджет МЁД и видит итог за
 *  месяц. Доступен до регистрации. Для виджета включается интерактивная демонстрация. */
export function CalculatorPage() {
  const [selected, setSelected] = useState<Partial<Record<CalcServiceId, boolean>>>({})
  const [values, setValues] = useState<Values>(initialValues)
  const [justAdded, setJustAdded] = useState<CalcServiceId | null>(null)

  const chosen = CALC_SERVICES.filter((s) => selected[s.id])
  const total = chosen.reduce((sum, s) => sum + s.calculate(values[s.id]).amount, 0)

  function toggle(id: CalcServiceId) {
    setSelected((cur) => ({ ...cur, [id]: !cur[id] }))
    setJustAdded(selected[id] ? null : id)
  }

  function setValue(id: CalcServiceId, key: string, raw: string) {
    setValues((cur) => ({ ...cur, [id]: { ...cur[id], [key]: Math.max(0, Number(raw) || 0) } }))
  }

  return (
    <div className="min-h-screen bg-bee-bg-primary">
      <header className="border-b border-bee-border-secondary bg-bee-bg-secondary px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 text-body-sm text-bee-content-secondary hover:text-bee-content-primary">
            <ArrowLeft size={16} />
            Вернуться на главную
          </Link>
          <div className="flex items-center gap-4">
            <AssistantLauncher />
            <Link to="/login" className="text-body-sm text-bee-content-secondary hover:text-bee-content-primary">
              Уже партнёр? Войти
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-8">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-headline-md font-medium text-bee-content-primary">Посчитайте свою выгоду</h1>
          <p className="text-body-sm text-bee-content-secondary">Выберите услуги и добавьте их в корзину</p>
        </div>

        <div className="sticky top-3 z-20 grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-3 rounded-bee-xl bg-bee-el-active px-5 py-4 text-bee-light shadow-lg sm:grid-cols-[1fr_auto_auto]">
          <div>
            <p className="text-body-accent-sm font-medium">Калькулятор выгоды</p>
            <p className="text-caption text-bee-content-tertiary">Суммарно за месяц</p>
          </div>
          <p className="text-headline-md font-medium" aria-live="polite">
            {rub(total)}
          </p>
          <div className="col-span-2 flex items-center gap-2 border-t border-white/10 pt-3 sm:col-span-1 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5">
            <span className="flex size-7 items-center justify-center rounded-full bg-bee-brand-primary text-bee-content-primary">
              <ShoppingCart size={14} />
            </span>
            <b className="text-caption font-medium whitespace-nowrap">{serviceWord(chosen.length)}</b>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <b className="text-body-sm text-bee-content-primary">Услуги</b>
            <span className="text-caption text-bee-content-tertiary">Сумма — в каждой строке</span>
          </div>
          <div className="flex flex-col gap-2.5" aria-label="Список услуг">
            {CALC_SERVICES.map((service) => {
              const active = Boolean(selected[service.id])
              const result = service.calculate(values[service.id])
              return (
                <article
                  key={service.id}
                  className={clsx(
                    'overflow-hidden rounded-bee-lg border bg-bee-bg-secondary transition-colors',
                    active
                      ? 'border-bee-brand-primary bg-bee-surface-yellow/20 ring-1 ring-bee-brand-primary/30'
                      : 'border-bee-border-secondary',
                  )}
                >
                  <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 p-4 sm:grid-cols-[1fr_130px_120px]">
                    <div className="min-w-0">
                      <strong className="block text-body-accent-sm font-medium text-bee-content-primary">{service.title}</strong>
                      <span className="mt-0.5 block text-caption text-bee-content-tertiary">{service.subtitle}</span>
                    </div>
                    <div className="text-right">
                      <span className="block text-[10px] tracking-wide text-bee-content-tertiary uppercase">Итого по услуге</span>
                      <b className="mt-0.5 block text-body-accent-md font-medium text-bee-content-primary">
                        {active ? rub(result.amount) : '0 ₽'}
                      </b>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggle(service.id)}
                      className={clsx(
                        'col-span-2 h-9 rounded-bee-pill border px-4 text-caption font-medium transition-colors sm:col-span-1',
                        active
                          ? 'border-bee-brand-primary bg-bee-surface-yellow text-bee-content-primary hover:bg-bee-brand-primary/40'
                          : 'border-bee-border-secondary bg-bee-bg-secondary text-bee-content-primary hover:border-bee-brand-primary hover:bg-bee-surface-yellow/40',
                      )}
                    >
                      {active ? 'Убрать' : 'Добавить'}
                    </button>
                  </div>

                  {active && (
                    <div
                      className="border-t border-bee-border-secondary px-4 pt-4 pb-4"
                      style={justAdded === service.id ? { animation: 'serviceReveal .28s ease-out both' } : undefined}
                    >
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {service.fields.map((field) => (
                          <label key={field.key} className="flex flex-col gap-1 text-caption text-bee-content-secondary">
                            {field.label}
                            <input
                              type="number"
                              min={0}
                              value={values[service.id][field.key]}
                              onChange={(e) => setValue(service.id, field.key, e.target.value)}
                              className="h-10 rounded-bee-sm border border-bee-border-secondary bg-bee-bg-primary px-3 text-body-sm text-bee-content-primary focus:outline-none focus:ring-2 focus:ring-bee-brand-tertiary"
                            />
                          </label>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-bee-border-secondary pt-3 text-caption text-bee-content-tertiary">
                        <span>{service.flow}</span>
                        <b className="font-medium text-bee-content-secondary">{result.detail}</b>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
          <p className="mt-3 text-caption text-bee-content-tertiary">
            Для виджета ваш доход составляет 5% от оборота покупок после перехода. Другие ставки фиксируются в
            согласованных офферах.
          </p>
        </div>

        <div className="flex flex-col items-center gap-3 rounded-bee-xl bg-bee-el-active px-6 py-8 text-center">
          <p className="text-body-accent-md font-medium text-bee-light">Начните продавать сейчас</p>
          <p className="max-w-md text-body-sm text-bee-content-tertiary">
            Регистрация занимает несколько минут, прогресс сохраняется автоматически.
          </p>
          <LinkButton to="/onboarding/registration" size="l">
            Зарегистрироваться
          </LinkButton>
        </div>
      </main>

      <MedWidgetDemo active={Boolean(selected.widget)} />
    </div>
  )
}
