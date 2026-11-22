import snapshot from './beeline-benefits.json' with { type:'json' }
import { emptyOffer } from './campaign-offer.ts'
import type { MarketOffer } from './market.ts'

export function benefitText(html: string): string {
  return html.replace(/\\r\\n|\\n/g, '\n').replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<br\s*\/?\s*>|<\/(?:p|li|ul|ol|h[1-6])>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, entity => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '})[entity]!)
    .replace(/\n[ \t]*\n+/g, '\n\n').trim()
}
function httpsLink(value: string | null) {
  try { const url = new URL(value ?? ''); return url.protocol === 'https:' && !url.username && !url.password ? url.href : '' }
  catch { return '' }
}
const groups: Record<string,string> = {
  'еда и продукты':'grocery', 'красота и здоровье':'health', 'развлечения':'fun',
  'цветы и подарки':'shopping', 'украшения':'shopping', 'банковские продукты':'finance', 'страхование':'finance',
}
// Some offers only have a promotional collection in the source feed.
const editorialGroups: Record<number,string> = {2725:'digital', 3183:'fun', 3562:'shopping', 3833:'food'}

// Local brand marks from partner sites. Newly imported IDs start with their name until a mark is available.
const logoIds = new Set([1512, 2160, 2725, 3027, 3183, 3550, 3552, 3562, 3565, 3833, 4197, 4263, 4311, 4339])
function benefitLogo(id: number) {
  if (id === 2613) return '/logos/benefits/beeline.svg'
  return logoIds.has(id) ? '/logos/benefits/logo-' + id + '.png' : ''
}

export const beelineOffers: MarketOffer[] = snapshot.items.map(item => {
  const detail = item.detail
  const sections = detail.additionalInformation.map(section => {
    const links = section.attachments.map(a => ({name:a.name,url:httpsLink(a.link)}))
    for (const match of section.description.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi))
      links.push({name:benefitText(match[2]),url:httpsLink(match[1])})
    return {title:section.name.trim(),text:benefitText(section.description),links:links.filter(l=>l.url)}
  })
  // Only a complete end date in the conditions can expire a card; a yearless label stays verbatim.
  const conditions = sections.filter(s=>s.title === 'условия').map(s=>s.text).join('\n')
  const end = /(?:до|по)\s+(\d{2})\.(\d{2})\.(\d{4})/.exec(conditions)
  const until = end ? `${end[3]}-${end[2]}-${end[1]}` : ''
  const category = item.category.map(c=>c.name).join(' · ')
  return {
    id:`beef0000-0000-5000-8000-${String(item.id).padStart(12,'0')}`,
    catalog:item.catalog, name:item.partner.name, category, group:item.category.map(c=>groups[c.name]).find(Boolean) ?? editorialGroups[item.id] ?? 'other',
    offer:{...emptyOffer,title:item.name.trim(),until,layout:'artwork'},
    erid:item.erid, online:false, addresses:[], website:'', image:item.image, logo:benefitLogo(item.id),
    source:{name:'билайн · Подарки и акции',url:snapshot.source + 'offer?id=' + item.id,
      fetchedAt:snapshot.fetchedAt,description:detail.description.trim(),validity:detail.promoCode.description ?? '',sections},
  }
})

// Compare the served and bundled snapshots when the UI and API update at different times.
type CatalogItem = {id:number; catalog?:{brand:string; benefit:string; condition:string}}
const catalogItems: CatalogItem[] = snapshot.items
export function beelineCatalogSummary(card: MarketOffer) {
  if (card.source?.fetchedAt !== snapshot.fetchedAt) return undefined
  const id = Number(new URL(card.source.url).searchParams.get('id'))
  return catalogItems.find(item=>item.id === id)?.catalog
}

export function activeBeelineOffers(day: string) {
  return beelineOffers.filter(o=>!o.offer.until || o.offer.until >= day)
}
