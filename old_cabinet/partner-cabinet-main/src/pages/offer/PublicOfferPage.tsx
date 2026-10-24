import { Link } from 'react-router-dom'
import { ArrowLeft, Download, ListChecks } from 'lucide-react'
import {
  OFFER_KEY_TERMS,
  OFFER_SECTIONS,
  PUBLIC_OFFER_META,
  renderOfferText,
} from '@/content/publicOffer'
import { Button } from '@/components/Button'
import { LinkButton } from '@/components/LinkButton'
import { AssistantLauncher } from '@/components/assistant/AssistantLauncher'
import { downloadText } from '@/utils/downloadText'

/** Публичная оферта — открыта без входа: условия площадки партнёр должен видеть ДО регистрации. */
export function PublicOfferPage() {
  return (
    <div className="min-h-screen bg-bee-bg-primary">
      <header className="border-b border-bee-border-secondary bg-bee-bg-secondary px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 text-body-sm text-bee-content-secondary hover:text-bee-content-primary">
            <ArrowLeft size={16} />
            МЁД
          </Link>
          <div className="flex items-center gap-4">
            <AssistantLauncher />
            <Link to="/login" className="text-body-sm text-bee-content-secondary hover:text-bee-content-primary">
              Уже партнёр? Войти
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
        <div className="flex flex-col gap-3">
          <h1 className="text-headline-md font-medium text-bee-content-primary">{PUBLIC_OFFER_META.title}</h1>
          <p className="text-body-sm text-bee-content-secondary">
            Версия {PUBLIC_OFFER_META.version}, действует с {PUBLIC_OFFER_META.effectiveFrom}
          </p>
          <p className="rounded-bee-md bg-bee-surface-yellow/50 px-3 py-2 text-caption text-bee-content-secondary">
            {PUBLIC_OFFER_META.disclaimer}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              priority="secondary-on-primary"
              size="m"
              onClick={() => downloadText(`oferta-med-v${PUBLIC_OFFER_META.version}.txt`, renderOfferText())}
            >
              <Download size={16} className="mr-1.5" /> Скачать текст
            </Button>
            <LinkButton to="/onboarding/registration" size="m">
              Стать партнёром
            </LinkButton>
          </div>
        </div>

        <section className="rounded-bee-xl border border-bee-border-secondary bg-bee-bg-secondary p-5">
          <div className="mb-3 flex items-center gap-2">
            <ListChecks size={18} className="text-bee-content-secondary" />
            <h2 className="text-body-accent-md font-medium text-bee-content-primary">Главное простыми словами</h2>
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {OFFER_KEY_TERMS.map((term) => (
              <div key={term.label}>
                <dt className="text-caption text-bee-content-tertiary">{term.label}</dt>
                <dd className="text-body-sm text-bee-content-primary">
                  {term.value}{' '}
                  <a href={`#${term.section}`} className="text-caption text-bee-link-primary hover:underline">
                    подробнее
                  </a>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <nav aria-label="Содержание" className="rounded-bee-xl border border-bee-border-secondary p-5">
          <h2 className="mb-2 text-body-accent-sm font-medium text-bee-content-primary">Содержание</h2>
          <ol className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            {OFFER_SECTIONS.map((section, i) => (
              <li key={section.id} className="text-body-sm">
                <a href={`#${section.id}`} className="text-bee-link-primary hover:underline">
                  {i + 1}. {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex flex-col gap-8">
          {OFFER_SECTIONS.map((section, i) => (
            <section key={section.id} id={section.id} className="scroll-mt-6">
              <h2 className="mb-3 text-headline-sm font-medium text-bee-content-primary">
                {i + 1}. {section.title}
              </h2>
              <ol className="flex flex-col gap-2">
                {section.clauses.map((clause, j) => (
                  <li key={j} className="flex gap-3 text-body-sm text-bee-content-secondary">
                    <span className="w-9 shrink-0 text-bee-content-tertiary">
                      {i + 1}.{j + 1}.
                    </span>
                    <span>{clause}</span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>

        <div className="flex flex-col items-center gap-3 rounded-bee-xl bg-bee-el-active px-6 py-8 text-center">
          <p className="text-body-accent-md font-medium text-bee-light">Условия понятны?</p>
          <p className="max-w-md text-body-sm text-bee-content-tertiary">
            Оферта принимается в личном кабинете в процессе подключения — после регистрации и проверки организации.
          </p>
          <LinkButton to="/onboarding/registration" size="l">
            Начать регистрацию
          </LinkButton>
        </div>
      </main>
    </div>
  )
}
