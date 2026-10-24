import { Suspense } from 'react'
import { Navigate, Outlet, useMatches } from 'react-router-dom'
import { useSessionStore } from '@/stores/sessionStore'
import { AppShell } from '@/components/AppShell'
import { PageLoading } from '@/components/PageLoading'

export function CabinetLayout() {
  const identity = useSessionStore((s) => s.identity)
  const matches = useMatches()
  const crumb = matches
    .map((m) => (m.handle as { crumb?: string } | undefined)?.crumb)
    .filter(Boolean)
    .at(-1)

  if (!identity) return <Navigate to="/login" replace />
  if (identity.scope !== 'partner') return <Navigate to="/admin" replace />

  return (
    <AppShell crumb={crumb}>
      <Suspense fallback={<PageLoading />}>
        <Outlet />
      </Suspense>
    </AppShell>
  )
}
