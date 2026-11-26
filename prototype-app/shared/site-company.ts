import { normalizeBusinessWebsite, offerSourceHint } from './campaign-business.ts'

export type SiteCompany = { brandName?: string; activity?: string }

export function searchPage(website: string) {
  const normalized = normalizeBusinessWebsite(website)
  if (!normalized) return null
  const page = new URL(normalized)
  if (page.port || !/^[a-z0-9.-]+\.(?:[a-z]{2,}|xn--[a-z0-9-]+)$/i.test(page.hostname) ||
      /\.(?:local|internal|localhost|test|example|invalid)$/i.test(page.hostname) || offerSourceHint(page)) return null
  if ([...page.searchParams.keys()].some(key => !/^(utm_.*|yclid|gclid|from)$/i.test(key))) return null
  page.hash = ''
  page.search = ''
  return page
}

export const pageSearchQuery = (page: URL) => 'site:' + page.hostname + ' ' + page.hostname + page.pathname

export function siteActivityExcerpt(text: string, previouslyImported = false) {
  const activity = text.trim()
  // Older imports clipped at exactly 100 characters, including in the middle of a word.
  const legacyCutoff = previouslyImported && activity.length === 100 && !/[.!?…]$/u.test(activity)
  if (activity.length <= 100 && !legacyCutoff) return activity
  const excerpt = activity.slice(0,100)
  const sentence = excerpt.match(/^.*[.!?](?=\s|$)/u)?.[0]
  if (sentence) return sentence
  return excerpt.slice(0,99).replace(/\s+\S*$/u,'').trimEnd() + '…'
}

export function companyFromPage(page: URL, title: string, description: string, siteName = ''): SiteCompany {
  const marketplace = ['ozon.ru','www.ozon.ru'].includes(page.hostname)
  const heading = title.split(/\s+[–—|\-]\s+/)
  const name = siteName || (page.pathname === '/' ? heading[0] : '')
  const summary = siteActivityExcerpt(description || heading.slice(1).join(' — ') || title)
  return {
    ...(!marketplace && name.trim() && {brandName:name.trim().slice(0,80)}),
    ...(summary && {activity:summary}),
  }
}
