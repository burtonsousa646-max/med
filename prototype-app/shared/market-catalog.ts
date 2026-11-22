import type { components } from '../src/api.gen.ts'
import { offerCreativeCopy } from './campaign-offer.ts'
import type { MarketOffer } from './market.ts'

export const marketGroups: Record<string,string> = {
  shopping:'Покупки и подарки', grocery:'Магазины у дома', food:'Еда и кофе', beauty:'Красота', health:'Здоровье',
  auto:'Авто', home:'Дом', sport:'Спорт', kids:'Дети', fun:'Развлечения', finance:'Финансы и страхование', digital:'Цифровые сервисы', other:'Другие',
}
export type CatalogFields = components['schemas']['CatalogFields']
export type CatalogRecord = components['schemas']['CatalogRecord']
export function catalogFields(card:MarketOffer):CatalogFields {
  const {benefit,title} = offerCreativeCopy(card.offer)
  const details=card.source?.sections.find(s=>/^описание/i.test(s.title))?.text ?? ''
  const lead=card.source?.description ?? ''
  return {
    brand:card.catalog?.brand ?? card.name, benefit:card.catalog?.benefit ?? (benefit || title),
    condition:card.catalog?.condition ?? (benefit ? title : card.source?.description || (card.online ? 'Онлайн' : card.addresses[0] || '')),
    description:card.description ?? [lead && !details.includes(lead) ? lead : '',details].filter(Boolean).join('\n\n'), group:card.group,
  }
}
export function validCatalogFields(raw:unknown):raw is CatalogFields {
  if (!raw || typeof raw!=='object') return false
  const fields = raw as CatalogFields
  return Object.entries({brand:180,benefit:300,condition:700,description:12000}).every(([key,max])=>{
    const v=fields[key as keyof CatalogFields]
    return typeof v==='string' && v.length<=max && (key==='condition' || key==='description' || !!v.trim())
  }) && typeof fields.group==='string' && Object.hasOwn(marketGroups,fields.group)
}
export function catalogPatch(base:MarketOffer, fields:CatalogFields):Partial<MarketOffer> {
  const initial=catalogFields(base), catalog:NonNullable<MarketOffer['catalog']>={}
  for (const key of ['brand','benefit','condition'] as const) if (fields[key]!==initial[key]) catalog[key]=fields[key]
  return {...(Object.keys(catalog).length ? {catalog} : {}), ...(fields.group!==initial.group && {group:fields.group}),
    ...(fields.description!==initial.description && {description:fields.description})}
}
export function applyCatalogPatch(base:MarketOffer,patch:Partial<MarketOffer>):MarketOffer {
  return {...base,...patch,...(patch.catalog && {catalog:{...base.catalog,...patch.catalog}})}
}
