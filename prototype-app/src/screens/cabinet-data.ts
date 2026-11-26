import { useQuery } from '@tanstack/react-query'
import { mvpRequest, useMvpSession } from './MvpSession'
import { staffRequest } from './staff-request'
import type { DashboardOverview, DashboardList } from '../../shared/cabinet-dashboard'

export function useCabinetData<T extends DashboardOverview | DashboardList>(path: string, enabled = true) {
  const session = useMvpSession()
  // Search terms may contain partner contact details. Keep them in the request body.
  const [endpoint, search] = path.split('?')
  const body = search ? Object.fromEntries(new URLSearchParams(search)) : undefined
  return useQuery({
    queryKey:[session.role ? 'v4-staff' : 'mvp-campaigns', session.email, 'dashboard', path],
    queryFn:({signal}) => session.role ? staffRequest<T>(endpoint,{signal,body}) : mvpRequest<T>(endpoint,body,session.email,undefined,signal),
    enabled, retry:false, gcTime:0, staleTime:15_000, refetchInterval:30_000,
  })
}

export function campaignRowPath(row:{id:string;kind:string},staff:boolean) {
  const id=encodeURIComponent(row.id)
  if (row.kind==='contract') return staff?'/app/staff/contract/'+id:'/app/campaigns/new?draft='+id+'&step=contract'
  return (staff?'/app/staff/':'/app/campaigns/')+id
}
