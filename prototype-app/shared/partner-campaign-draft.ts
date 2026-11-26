import { type PartnerDetails, partnerFields } from './partner-details.ts'
import { validPromoCompany, validPromoLogo, type Promo } from './mvp-promo.ts'

export const setupSteps = ['Оффер', 'Аудитория', 'Договор'] as const
export const contractMailbox = 'beepartners@beeline.ru'
export const placementTerms = 'Размещение — 1 000 ₽ до 1 марта 2027 года.'
export type ContractInput = {
  method?:'inn'|'file'|'manual'
  editing?:boolean
  inn?:string
  confirmedInn?:string
  companyName?:string
  manual?:{inn:string;fields:PartnerDetails}
  fields?:PartnerDetails
  fileFields?:PartnerDetails
  attachment?:import('./campaign-contract.ts').ContractAttachment
}
export const importFields=['brandName','activity','cond','off','code'] as const
type ImportValues=Partial<Pick<Promo,typeof importFields[number]>>
export type ImportedSource={website:string; values:ImportValues}
export type PartnerDraft = {contractInput?:ContractInput; imported?:ImportedSource; promo:Promo; step:number; adReviewed:boolean; audienceReviewed:boolean; sourceReady:boolean}
export type SavedPartnerDraft = {data:PartnerDraft; version:number; updatedAt:number}
export type DraftSummary = {id:string; code:string; title:string; step:number; updatedAt:number}

export function validPartnerDraft(data:Partial<PartnerDraft> | null):data is PartnerDraft {
  const p=data?.promo
  if (!p || typeof p!=='object' || ![1,2,3].includes(data.step!) ||
      [data.adReviewed,data.audienceReviewed,data.sourceReady].some(flag=>typeof flag!=='boolean')) return false
  const contract=data.contractInput
  if(data.imported && (typeof data.imported.website!=='string' || data.imported.website.length>250 ||
      !data.imported.values || typeof data.imported.values!=='object' ||
      !Object.entries(data.imported.values).every(([k,v])=>importFields.some(field=>field===k)&&typeof v==='string'&&v.length<=100))) return false
  if (contract) {
    if(typeof contract!=='object' || (contract.method!==undefined && !['inn','file','manual'].includes(contract.method)))return false
    if(contract.inn!==undefined && (typeof contract.inn!=='string' || !/^\d{0,12}$/.test(contract.inn)))return false
    if(contract.confirmedInn!==undefined && (typeof contract.confirmedInn!=='string' || contract.confirmedInn!==contract.inn || !/^(?:\d{10}|\d{12})$/.test(contract.confirmedInn)))return false
    if(contract.companyName!==undefined && (typeof contract.companyName!=='string' || contract.companyName.length>80))return false
    if(contract.manual!==undefined){
      const m=contract.manual
      if(!m || typeof m.inn!=='string' || !/^\d{0,12}$/.test(m.inn) || !m.fields || typeof m.fields!=='object' || Array.isArray(m.fields) ||
        !Object.entries(m.fields).every(([key,v])=>Object.hasOwn(partnerFields,key) && typeof v==='string' && v.length<=partnerFields[key as keyof PartnerDetails].length))return false
    }
    for(const fields of [contract.fields,contract.fileFields])if(fields && (typeof fields!=='object' || !Object.values(fields).every(v=>typeof v==='string' && v.length<=2000)))return false
    const f=contract.attachment
    if(f && (typeof f.name!=='string' || f.name.length>200 || !['application/pdf','image/png','image/jpeg'].includes(f.type) || typeof f.base64!=='string' || f.base64.length>4194304))return false
  }
  return ['code','off','cond','site','till'].every(k=>typeof p[k as keyof Promo]==='string')
    && validPromoCompany(p)
    && validPromoLogo(p.logo)
    && (!p.addresses || Array.isArray(p.addresses) && p.addresses.length<=10 && p.addresses.every(a=>typeof a==='string' && a.length<=200))
    && [p.area,p.city,p.wishes,p.gender,p.age,p.income,p.moment].every(v=>v===undefined || typeof v==='string')
    && (p.photo===undefined || typeof p.photo?.name==='string' && typeof p.photo?.src==='string' && /^data:image\/(webp|png);base64,/i.test(p.photo.src))
}

export function mergeSource(promo:Promo, fields:ImportValues, website?:string, previous?:ImportedSource) {
  const next={...promo,site:website??promo.site}
  const imported:ImportValues={}
  for(const key of importFields){
    const wasImported=previous?.values[key]!==undefined && previous.values[key]===promo[key]
    if(promo[key] && !(wasImported && website && previous?.website!==website)){
      if(wasImported)imported[key]=promo[key]
      continue
    }
    next[key]=fields[key]||''
    if(website && fields[key])imported[key]=fields[key]
  }
  return {promo:next,imported:website?{website,values:imported}:previous}
}

export function siteOfferFields(site:{name:string; subject:string; description:string; offerText?:string}):Partial<Promo> {
  const text=[site.subject,site.description,site.offerText].filter(Boolean).join(' ')
  const discounts=[...new Set([...text.matchAll(/скидк[аиу]\s*[:–—-]?\s*(\d{1,2})\s*%/gi)].map(m=>m[1]))]
  const codes=[...new Set([...text.matchAll(/(?:[Пп]ромокод(?:у|ом)?|ПРОМОКОД(?:У|ОМ)?)[\s:«"“„–—-]+([A-ZА-ЯЁ0-9]{4,20})(?![А-Яа-яЁёA-Za-z0-9])/g)].map(m=>m[1]))]
  const cond=(site.offerText||site.subject||site.description||site.name).trim().slice(0,60)
  return {...(cond&&{cond}),...(codes.length===1&&{code:codes[0]}),...(discounts.length===1&&+discounts[0]>0&&+discounts[0]<=90&&{off:discounts[0]})}
}

export function offerFromTerms(promo:Promo) {
  const terms=promo.cond.trim()
  const discount=/^(?:[1-9]|[1-8]\d|90)$/.test(promo.off) ? 'Скидка '+promo.off+'%' : ''
  if(terms){
    const line=discount && /^(на|при|для|по|от)\s/i.test(terms) && !terms.includes('%')
      ? discount+' '+terms[0].toLowerCase()+terms.slice(1) : terms
    return line.length<=60 ? line : terms
  }
  if(discount)return discount+' по промокоду'
  const brand=promo.brandName?.trim()
  if(brand){
    const label='Предложение от '+brand
    if(label.length<=60)return label
  }
  return ''
}
