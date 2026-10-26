import { Component, StrictMode, Suspense, useEffect, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router'
import { MotionConfig } from 'motion/react'
import { QueryClientProvider } from '@tanstack/react-query'
import '../../design-system/tokens.css'
import '../../design-system/components.css'
import './app.css'
import { queryClient, useCampaigns } from './api'
import Landing from './screens/Landing'
import { Inn, Login } from './screens/Entry'
import { Approve, Checkout, Consent, Launch, Reach } from './screens/Flow'
import Build from './screens/Build'
import Near from './screens/Near'
import { Balance, Campaigns, Company, Connections, Docs, Help, Stats } from './screens/Cabinet'
import { Brand, DemoMenu, Toaster, screenName } from './ui'

function Offer() {
  return (
    <div className="bl-page wrap">
      <header className="bl-header"><div className="bl-header__side"><Brand /></div></header>
      <section className="bl-section">
        <h1 className="bl-h1" style={{ marginBottom: 24 }}>оферта на размещение рекламы</h1>
        <p className="bl-body bl-secondary" style={{ maxWidth: 'var(--text-max)' }}>Текст оферты готовят юристы. Здесь заглушка: предмет — размещение рекламных материалов на поверхностях билайна с оплатой за клики, целевые действия или комиссией с продаж; акцепт — отметка в кабинете или подтверждение через бизнес-ID; закрывающие документы — через ЭДО.</p>
      </section>
    </div>
  )
}

// «Статистика» в меню кабинета — последняя запущенная кампания
function LatestStats() {
  const live = useCampaigns().find(c => c.launchedAt || c.status === 'moderation')
  return live ? <Navigate to={`/cab/stats/${live.id}`} replace /> : <Stats />
}

// Новый экран открывается сверху, а заголовок вкладки называет экран
function OnRoute() {
  const { pathname } = useLocation()
  useEffect(() => {
    scrollTo(0, 0)
    const name = screenName(pathname)?.replace(/^[\d.]+ · /, '')
    document.title = pathname === '/' ? 'Рекламная платформа билайна' : pathname === '/near' ? 'Лучшее рядом · билайн' : `${name ?? 'кабинет'} · рекламная платформа билайна`
  }, [pathname])
  return null
}

// Ошибка запроса при отрисовке (кампания не найдена, сервер недоступен) — понятный экран вместо белого
class Failsafe extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(e: unknown) { return { error: (e as { message?: string })?.message ?? 'сервер не ответил' } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="bl-page wrap"><section className="bl-section pad bl-stack" style={{ marginTop: 48, maxWidth: 640, ['--bl-gap' as string]: '16px' }}>
        <h1 className="bl-h2">не получилось открыть экран</h1>
        <p className="bl-body bl-secondary">{this.state.error}</p>
        <div><Link className="bl-btn bl-btn--primary" to="/cab/campaigns" onClick={() => this.setState({ error: null })}>к кампаниям</Link></div>
      </section></div>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <HashRouter>
          <OnRoute />
          <Failsafe>
            <Suspense fallback={<div className="bl-page wrap" aria-busy="true" />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/login" element={<Login />} />
                <Route path="/inn" element={<Inn />} />
                <Route path="/consent" element={<Consent />} />
                <Route path="/c/:id/reach" element={<Reach />} />
                <Route path="/c/:id/build" element={<Build />} />
                <Route path="/c/:id/checkout" element={<Checkout />} />
                <Route path="/c/:id/launch" element={<Launch />} />
                <Route path="/approve/:token" element={<Approve />} />
                <Route path="/cab/stats" element={<LatestStats />} />
                <Route path="/cab/stats/:id" element={<Stats />} />
                <Route path="/cab/campaigns" element={<Campaigns />} />
                <Route path="/cab/connections" element={<Connections />} />
                <Route path="/cab/balance" element={<Balance />} />
                <Route path="/cab/docs" element={<Docs />} />
                <Route path="/cab/company" element={<Company />} />
                <Route path="/cab/help" element={<Help />} />
                <Route path="/offer" element={<Offer />} />
                <Route path="/near" element={<Near />} />
                <Route path="*" element={<Landing />} />
              </Routes>
              <DemoMenu />
            </Suspense>
          </Failsafe>
          <Toaster />
        </HashRouter>
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
)
