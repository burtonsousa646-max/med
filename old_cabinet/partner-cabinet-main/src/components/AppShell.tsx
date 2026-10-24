import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppShell({ crumb, children }: { crumb?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-bee-bg-primary">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col lg:pl-0">
        <Topbar crumb={crumb} />
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  )
}
