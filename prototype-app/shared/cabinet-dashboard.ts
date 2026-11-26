import type { components } from '../src/api.gen.ts'
import type { PartnerCampaignStatus } from './mvp-promo.ts'

export const campaignLabels = {
  authorization: 'Авторизация', contract: 'Договор', review: 'Модерация',
  published: 'Активна', stopped: 'Приостановлена', archived: 'Архив',
} satisfies Record<PartnerCampaignStatus, string>
export const campaignStages = Object.keys(campaignLabels) as PartnerCampaignStatus[]
export type BoardCard = components['schemas']['CampaignBoardCard']
export type Channel = components['schemas']['CabinetChannel']
export const channelLabels = { online: 'Онлайн', places: 'Точки продаж', unspecified: 'Не указан' } satisfies Record<Channel,string>
export type DashboardList = components['schemas']['CabinetDashboardList']
export type DashboardRow = DashboardList['items'][number]
export type DashboardOverview = components['schemas']['CabinetDashboardOverview']
export type DashboardGroup = DashboardOverview['groups'][number]
export type DashboardEvent = DashboardOverview['recent'][number]
export const dayMs = 86_400_000
export const moscowDay = (time: number) => Math.floor((time + 3 * 3_600_000) / dayMs)
export const dayDate = (day: number) => new Date(day * dayMs)
export const dashboardPageSize = 10
export const dashboardSorts = ['newest', 'oldest', 'name'] as const
export function dashboardSearchParams(input: unknown) {
  const params = new URLSearchParams()
  if (input && typeof input === 'object') {
    for (const key of ['page','q','sort','status','days'] as const) {
      const value = (input as Record<string,unknown>)[key]
      if (typeof value === 'string' || typeof value === 'number') params.set(key, String(value))
    }
  }
  return params
}
export function dashboardFilter(params: URLSearchParams) {
  const requested = Number(params.get('page') || 1)
  const status = params.get('status') ?? '', sort = params.get('sort')
  return {
    q: (params.get('q') ?? '').trim().toLocaleLowerCase('ru').slice(0, 120),
    status: Object.hasOwn(campaignLabels, status) ? status as PartnerCampaignStatus : '',
    days: reportPeriod(params.get('days')),
    sort: dashboardSorts.find(value => value === sort) ?? 'newest',
    page: Number.isSafeInteger(requested) && requested > 0 ? requested : 1,
  } as const
}

export function reportPeriod(value: string | null) {
  return [7,30,90].find(days=>String(days)===value) ?? 0
}
export const periodStart = (days:number, now=Date.now()) => (moscowDay(now)-days+1)*dayMs - 10_800_000
export type MarketResponseReport = components['schemas']['MarketResponseReport']
export type MarketAction = components['schemas']['MarketAction']
