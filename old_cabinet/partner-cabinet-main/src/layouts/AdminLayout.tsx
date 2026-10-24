import { Suspense } from 'react'
import { Navigate, Outlet, useMatches } from 'react-router-dom'
import { useSessionStore } from '@/stores/sessionStore'
import { AppShell } from '@/components/AppShell'
import { ForbiddenState } from '@/components/EmptyState'
import { PageLoading } from '@/components/PageLoading'

export function AdminLayout() {
  const identity = useSessionStore((s) => s.identity)
  const matches = useMatches()
  const crumb = matches
    .map((m) => (m.handle as { crumb?: string } | undefined)?.crumb)
    .filter(Boolean)
    .at(-1)

  if (!identity) return <Navigate to="/login" replace />

  return (
    <AppShell crumb={crumb}>
      {identity.scope !== 'internal' ? (
        <ForbiddenState
          title="Раздел доступен только сотрудникам Билайна"
          description="Переключите демо-роль на КАМ, модератора или финансы Билайна, чтобы открыть внутреннюю админку."
        />
      ) : (
        <Suspense fallback={<PageLoading />}>
          <Outlet />
        </Suspense>
      )}
    </AppShell>
  )
}
