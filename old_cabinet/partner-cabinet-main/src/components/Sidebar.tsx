import { Link, NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { useSessionStore } from '@/stores/sessionStore'
import { useUiStore } from '@/stores/uiStore'
import { NAV_SECTIONS } from '@/routes/nav'

function Logo() {
  return (
    <Link
      to="/"
      aria-label="На главную страницу МЁД"
      title="На главную: преимущества для партнёров и клиентов"
      className="flex items-center gap-2 rounded-bee-md px-2 py-1 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bee-brand-tertiary"
    >
      <span className="flex size-9 items-center justify-center rounded-bee-md bg-bee-brand-primary text-body-accent-md font-medium text-bee-content-primary">
        М
      </span>
      <div className="leading-tight">
        <p className="text-body-accent-sm font-medium text-bee-light">МЁД</p>
        <p className="text-caption text-bee-content-tertiary">Кабинет партнёра</p>
      </div>
    </Link>
  )
}

export function Sidebar() {
  const identity = useSessionStore((s) => s.identity)
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const closeSidebar = useUiStore((s) => s.closeSidebar)
  const sections = NAV_SECTIONS.filter((section) => section.scope === identity?.scope)

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-bee-bg-overlay lg:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-[246px] shrink-0 flex-col gap-6 overflow-y-auto bg-bee-el-active px-3 py-4 transition-transform duration-200 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <Logo />
        <nav className="flex flex-1 flex-col gap-5">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="mb-2 px-3 text-caption font-medium tracking-wide text-bee-content-tertiary uppercase">
                {section.title}
              </p>
              <ul className="flex flex-col gap-0.5">
                {section.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={closeSidebar}
                      className={({ isActive }) =>
                        clsx(
                          'flex items-center gap-3 rounded-bee-md px-3 py-2.5 text-body-sm transition-colors',
                          isActive
                            ? 'bg-bee-brand-primary text-bee-content-primary font-medium'
                            : 'text-bee-el-primary/80 hover:bg-white/5 hover:text-bee-el-primary',
                        )
                      }
                    >
                      <item.icon size={18} className="shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  )
}
