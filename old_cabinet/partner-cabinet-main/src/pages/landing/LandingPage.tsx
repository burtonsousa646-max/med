import { Link } from 'react-router-dom'
import { Users, Wallet, Rocket, BarChart3, ShieldCheck, Tag, Smile, MapPin, type LucideIcon } from 'lucide-react'
import { useSessionStore } from '@/stores/sessionStore'
import { LinkButton } from '@/components/LinkButton'
import { AssistantLauncher } from '@/components/assistant/AssistantLauncher'
import { OFFER_MODELS } from '@/content/offerModels'

interface Benefit {
  icon: LucideIcon
  title: string
  text: string
}

const PARTNER_BENEFITS: Benefit[] = [
  {
    icon: Users,
    title: 'Доступ к аудитории Билайна',
    text: 'Показываем предложение клиентам Билайна — без затрат на массовое привлечение.',
  },
  {
    icon: Wallet,
    title: 'Оплата за результат',
    text: 'Платите только за покупку, заявку или другое подтверждённое действие.',
  },
  {
    icon: Rocket,
    title: 'Быстрый запуск',
    text: 'Стартуйте с промокодами без API. Интеграцию можно подключить позже.',
  },
  {
    icon: BarChart3,
    title: 'Прозрачная аналитика',
    text: 'Продажи, конверсия и расчёты — в одном кабинете, с возможностью интеграции с MMP и системами сквозной аналитики.',
  },
]

const CUSTOMER_BENEFITS: Benefit[] = [
  { icon: Tag, title: 'Выгодные предложения', text: 'Понятная выгода от проверенных партнёров.' },
  { icon: Smile, title: 'Понятный путь покупки', text: 'От предложения до покупки — несколько касаний.' },
  { icon: ShieldCheck, title: 'Доверие бренда Билайна', text: 'Каждый партнёр и предложение проходят проверку.' },
  { icon: MapPin, title: 'Релевантность', text: 'Предложения с учётом интересов и географии клиента.' },
]

const STEPS = [
  { n: 1, title: 'Регистрация', text: 'Контакты и реквизиты организации — можно сохранить черновик и вернуться позже.' },
  { n: 2, title: 'Создание предложения', text: 'Опишите идею в двух словах — AI поможет с текстом и иконкой.' },
  { n: 3, title: 'Продажи', text: 'С использованием больших данных Билайн мы предлагаем клиентам ваш оффер.' },
  { n: 4, title: 'Расчёты', text: 'Заказы, расчёты и аналитика — в одном кабинете, в реальном времени.' },
]

export function LandingPage() {
  const identity = useSessionStore((s) => s.identity)
  // Вошедший пользователь тоже видит главную (логотип в кабинете ведёт сюда) — и может вернуться в кабинет.
  const cabinetHref = identity ? (identity.scope === 'internal' ? '/admin' : '/dashboard') : null

  return (
    <div className="min-h-screen bg-bee-bg-primary">
      <header className="sticky top-0 z-30 border-b border-bee-border-secondary bg-bee-bg-secondary px-4 py-3 sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-bee-md bg-bee-brand-primary text-body-accent-md font-medium text-bee-content-primary">
              М
            </span>
            <div>
              <p className="text-body-accent-sm leading-tight font-medium text-bee-content-primary">МЁД</p>
              <p className="text-caption leading-tight text-bee-content-tertiary">Партнёрская платформа Билайна</p>
            </div>
          </div>
          <nav className="flex items-center gap-3 sm:gap-5">
            <Link to="/calculator" className="hidden text-body-sm text-bee-content-secondary hover:text-bee-content-primary md:inline">
              Калькулятор
            </Link>
            <Link to="/offer" className="hidden text-body-sm text-bee-content-secondary hover:text-bee-content-primary md:inline">
              Публичная оферта
            </Link>
            <AssistantLauncher />
            {cabinetHref ? (
              <Link to={cabinetHref} className="text-body-sm font-medium text-bee-content-primary hover:underline">
                Перейти в кабинет →
              </Link>
            ) : (
              <Link to="/login" className="text-body-sm text-bee-content-secondary hover:text-bee-content-primary">
                Уже партнёр? Войти
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-8 sm:py-16">
        <section className="flex flex-col items-center gap-5 text-center">
          <span className="rounded-bee-pill bg-bee-surface-yellow px-3 py-1 text-caption font-medium text-bee-brand-tertiary">
            Демо-прототип
          </span>
          <h1 className="max-w-3xl text-display-sm font-normal text-bee-content-primary sm:text-display-md">
            Соединяем клиентов Билайна с лучшими предложениями партнёров
          </h1>
          <p className="max-w-2xl text-body-md text-bee-content-secondary">
            МЁД — единая платформа для запуска партнёрских предложений в каналах Билайна и за пределами экосистемы.
            Подключение, разные модели монетизации, расчёты и аналитика — в одном кабинете. Запуск — за один день.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <LinkButton to={cabinetHref ?? '/onboarding/registration'} size="l">
              {cabinetHref ? 'Перейти в кабинет' : 'Стать партнёром'}
            </LinkButton>
            <LinkButton to="/calculator" priority="secondary-on-primary" size="l">
              Посчитать выгоду
            </LinkButton>
          </div>
        </section>

        <section className="mt-16 grid grid-cols-1 gap-8 lg:grid-cols-2">
          <BenefitColumn title="Выгода для партнёра" items={PARTNER_BENEFITS} />
          <BenefitColumn title="Выгода для клиента" items={CUSTOMER_BENEFITS} />
        </section>

        <section className="mt-16">
          <h2 className="mb-2 text-center text-headline-sm font-medium text-bee-content-primary">Какие бывают офферы</h2>
          <p className="mx-auto mb-6 max-w-xl text-center text-body-sm text-bee-content-secondary">
            Выберите модель, которая подходит вашему бизнесу: от неё зависит, кто кому платит и какая интеграция нужна.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {OFFER_MODELS.map((model) => (
              <article
                key={model.id}
                className="flex flex-col gap-2 rounded-bee-xl border border-bee-border-secondary bg-bee-bg-secondary p-5"
              >
                <p className="text-caption font-medium tracking-wide text-bee-brand-tertiary">{model.landing.tag}</p>
                <h3 className="text-body-accent-sm leading-snug font-medium text-bee-content-primary">
                  {model.landing.title}
                </h3>
                <p className="text-caption text-bee-content-secondary">{model.landing.text}</p>
                <p className="mt-1 rounded-bee-md bg-bee-bg-primary px-3 py-2 text-caption font-medium text-bee-content-primary">
                  {model.landing.flow}
                </p>
                <p className="mt-auto pt-1 text-caption text-bee-content-tertiary">{model.landing.suits}</p>
              </article>
            ))}
          </div>
          <div className="mt-5 text-center">
            <LinkButton to="/calculator" priority="secondary-on-primary" size="m">
              Посчитать для своей модели
            </LinkButton>
          </div>
        </section>

        <section className="mt-16">
          <h2 className="mb-6 text-center text-headline-sm font-medium text-bee-content-primary">Как это работает</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-bee-xl border border-bee-border-secondary bg-bee-bg-secondary p-5">
                <span className="flex size-8 items-center justify-center rounded-full bg-bee-brand-primary text-caption font-medium text-bee-content-primary">
                  {s.n}
                </span>
                <p className="mt-3 text-body-accent-sm font-medium text-bee-content-primary">{s.title}</p>
                <p className="mt-1 text-caption text-bee-content-secondary">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {!cabinetHref && (
          <section className="mt-16 flex flex-col items-center gap-4 rounded-bee-xl bg-bee-el-active px-6 py-10 text-center">
            <p className="text-headline-sm font-medium text-bee-light">Готовы подключиться?</p>
            <p className="max-w-md text-body-sm text-bee-content-tertiary">
              Регистрация занимает несколько минут. Прогресс сохраняется — можно вернуться позже.
            </p>
            <LinkButton to="/onboarding/registration" size="l">
              Зарегистрироваться
            </LinkButton>
          </section>
        )}
      </main>

      <footer className="border-t border-bee-border-secondary px-4 py-6 text-center text-caption text-bee-content-tertiary sm:px-8">
        <div className="mb-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
          <Link to="/offer" className="text-bee-link-primary hover:underline">
            Публичная оферта для партнёров
          </Link>
          <Link to="/calculator" className="text-bee-link-primary hover:underline">
            Калькулятор выгоды
          </Link>
        </div>
        МЁД — демонстрационный прототип партнёрского кабинета. Не является действующим предложением Билайна.
      </footer>
    </div>
  )
}

function BenefitColumn({ title, items }: { title: string; items: Benefit[] }) {
  return (
    <div>
      <h2 className="mb-4 text-headline-sm font-medium text-bee-content-primary">{title}</h2>
      <div className="flex flex-col gap-4">
        {items.map((b) => (
          <div key={b.title} className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-bee-md bg-bee-el-secondary text-bee-content-secondary">
              <b.icon size={18} />
            </span>
            <div>
              <p className="text-body-accent-sm font-medium text-bee-content-primary">{b.title}</p>
              <p className="text-caption text-bee-content-secondary">{b.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
