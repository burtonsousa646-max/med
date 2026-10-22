import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes, useLocation } from 'react-router'
import { MotionConfig } from 'motion/react'
import '../../design-system/tokens.css'
import '../../design-system/components.css'
import './app.css'
import Landing from './screens/Landing'
import { Inn, Login } from './screens/Entry'
import { Approve, Checkout, Consent, Launch, Reach } from './screens/Flow'
import Build from './screens/Build'
import { Balance, Campaigns, Company, Docs, Help, Stats } from './screens/Cabinet'
import { Brand, DemoMenu, SCREENS, Toaster } from './ui'

function Offer() {
  return (
    <div className="bl-page wrap">
      <header className="bl-header"><div className="bl-header__side"><Brand /></div></header>
      <section className="bl-section">
        <h1 className="bl-h1" style={{ marginBottom: 24 }}>оферта на размещение рекламы</h1>
        <p className="bl-body bl-secondary" style={{ maxWidth: 'var(--text-max)' }}>Текст оферты готовят юристы. Здесь заглушка: предмет — размещение рекламных материалов на поверхностях билайна с оплатой за клики; акцепт — отметка в кабинете или подтверждение через бизнес-ID; закрывающие документы — через ЭДО.</p>
      </section>
    </div>
  )
}

// Новый экран открывается сверху, а заголовок вкладки называет экран
function OnRoute() {
  const { pathname } = useLocation()
  useEffect(() => {
    scrollTo(0, 0)
    const name = SCREENS.find(s => s[1] === pathname)?.[2].replace(/^[\d.]+ · /, '')
    document.title = pathname === '/' ? 'Рекламная платформа билайна' : `${name ?? 'оферта'} · рекламная платформа билайна`
  }, [pathname])
  return null
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <HashRouter>
        <OnRoute />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/inn" element={<Inn />} />
          <Route path="/consent" element={<Consent />} />
          <Route path="/reach" element={<Reach />} />
          <Route path="/build" element={<Build />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/approve" element={<Approve />} />
          <Route path="/launch" element={<Launch />} />
          <Route path="/cab/stats" element={<Stats />} />
          <Route path="/cab/campaigns" element={<Campaigns />} />
          <Route path="/cab/balance" element={<Balance />} />
          <Route path="/cab/docs" element={<Docs />} />
          <Route path="/cab/company" element={<Company />} />
          <Route path="/cab/help" element={<Help />} />
          <Route path="/offer" element={<Offer />} />
          <Route path="*" element={<Landing />} />
        </Routes>
        <DemoMenu />
        <Toaster />
      </HashRouter>
    </MotionConfig>
  </StrictMode>,
)
