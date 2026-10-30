import { Component, StrictMode, Suspense, useEffect, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router'
import { MotionConfig } from 'motion/react'
import { QueryClientProvider } from '@tanstack/react-query'
import '../design-system/tokens.css'
import '../design-system/components.css'
import './app.css'
import { queryClient } from './api'
import { Home, Invite, Login, Onboarding, RequireAuth } from './screens/Entry'
import { Approve, Checkout, Consent, Launch, Reach } from './screens/Flow'
import Build from './screens/Build'
import Near from './screens/Near'
import Admin from './admin/Admin'
import { Balance, Campaigns, Company, Connections, Docs, Help, Stats } from './screens/Cabinet'
import { Brand, Toaster, gap } from './ui'

function Offer() {
  return (
    <div className="bl-page wrap">
      <header className="bl-header"><div className="bl-header__side"><Brand /></div></header>
      <section className="bl-section">
        <h1 className="bl-h1" style={{ marginBottom: 24 }}>оферта на размещение рекламы</h1>
        <p className="bl-body bl-secondary" style={{ maxWidth: 'var(--text-max)' }}>Текст оферты готовят юристы. Предмет — размещение рекламных материалов на поверхностях билайна с оплатой за клики, целевые действия или комиссией с продаж; акцепт — отметка в кабинете подписантом, вошедшим через бизнес-ID; закрывающие документы — через ЭДО.</p>
      </section>
    </div>
  )
}

// Новый экран открывается сверху
function OnRoute() {
  const { pathname } = useLocation()
  useEffect(() => { scrollTo(0, 0) }, [pathname])
  return null
}

// Ошибка запроса при отрисовке — понятный экран вместо белого
class Failsafe extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(e: unknown) { return { error: (e as { message?: string })?.message ?? 'сервер не ответил' } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="bl-page wrap"><section className="bl-section pad bl-stack" style={{ marginTop: 48, maxWidth: 640, ...gap('16px') }}>
        <h1 className="bl-h2">не получилось открыть экран</h1>
        <p className="bl-body bl-secondary">{this.state.error}</p>
        <div><Link className="bl-btn bl-btn--primary" to="/cab/campaigns" onClick={() => this.setState({ error: null })}>к кампаниям</Link></div>
      </section></div>
    )
  }
}

const auth = (el: ReactNode, company = true) => <RequireAuth company={company}>{el}</RequireAuth>

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <OnRoute />
          <Failsafe>
            <Suspense fallback={<div className="bl-page wrap" aria-busy="true" />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/onboarding" element={auth(<Onboarding />, false)} />
                <Route path="/invite/:token" element={auth(<Invite />, false)} />
                <Route path="/cabinet" element={auth(<Home />)} />
                <Route path="/consent" element={auth(<Consent />)} />
                <Route path="/c/:id/reach" element={auth(<Reach />)} />
                <Route path="/c/:id/build" element={auth(<Build />)} />
                <Route path="/c/:id/checkout" element={auth(<Checkout />)} />
                <Route path="/c/:id/launch" element={auth(<Launch />)} />
                <Route path="/approve/:token" element={auth(<Approve />)} />
                <Route path="/cab/stats" element={auth(<Stats />)} />
                <Route path="/cab/stats/:id" element={auth(<Stats />)} />
                <Route path="/cab/campaigns" element={auth(<Campaigns />)} />
                <Route path="/cab/connections" element={auth(<Connections />)} />
                <Route path="/cab/balance" element={auth(<Balance />)} />
                <Route path="/cab/docs" element={auth(<Docs />)} />
                <Route path="/cab/company" element={auth(<Company />)} />
                <Route path="/cab/help" element={auth(<Help />)} />
                <Route path="/offer" element={<Offer />} />
                <Route path="/near" element={<Near />} />
                <Route path="/admin/*" element={<Admin />} />
                <Route path="*" element={<Navigate to="/cabinet" replace />} />
              </Routes>
            </Suspense>
          </Failsafe>
          <Toaster />
        </BrowserRouter>
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
)
