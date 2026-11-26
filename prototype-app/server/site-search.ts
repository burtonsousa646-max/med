import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { companyFromPage, pageSearchQuery, searchPage } from '../shared/site-company.ts'

function xmlText(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]+>/g,'')
    .replace(/&(amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, (match, entity:string) => {
      if (entity[0] !== '#') return ({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'})[entity] ?? match
      const n = entity[1] === 'x' ? parseInt(entity.slice(2),16) : Number(entity.slice(1))
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''
    }).replace(/\s+/g,' ').trim()
}

export function indexedCompany(xml: string, wanted: URL) {
  const pageKey = (page:URL) => page.hostname.replace(/^www\./,'') + page.pathname.replace(/\/$/,'')
  for (const [doc] of xml.matchAll(/<doc\b[^>]*>[\s\S]*?<\/doc>/gi)) {
    const url = xmlText(doc.match(/<url>([\s\S]*?)<\/url>/i)?.[1] ?? '')
    const page = searchPage(url)
    if (!page || pageKey(page) !== pageKey(wanted)) continue
    const title = xmlText(doc.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '')
    const passage = xmlText(doc.match(/<passage>([\s\S]*?)<\/passage>/i)?.[1] ?? '')
    if (title || passage) return companyFromPage(page,title,passage)
  }
  return null
}

export const siteSearch = new Hono()
let since = 0, count = 0
siteSearch.post('/site-search',bodyLimit({maxSize:1024}),async c => {
  const body = await c.req.json().catch(()=>null)
  const page = typeof body?.website === 'string' && searchPage(body.website)
  if (!page) return c.json({message:'Укажите публичную страницу компании или товара'},400)
  const key = process.env.YANDEX_SEARCH_API_KEY, folderId = process.env.YANDEX_SEARCH_FOLDER_ID
  if (!key || !folderId) return c.json({company:null})
  if (Date.now()-since >= 86_400_000) { since=Date.now(); count=0 }
  if (count>=300) return c.json({message:'Поиск временно недоступен'},429)
  count++
  try {
    const response=await fetch('https://searchapi.api.cloud.yandex.net/v2/web/search',{
      method:'POST',redirect:'error',signal:AbortSignal.any([c.req.raw.signal,AbortSignal.timeout(5000)]),
      headers:{'Content-Type':'application/json',Authorization:'Api-Key '+key},
      body:JSON.stringify({folderId,query:{searchType:'SEARCH_TYPE_RU',queryText:pageSearchQuery(page)},
        groupSpec:{groupMode:'GROUP_MODE_FLAT',groupsOnPage:'5'},maxPassages:'1',responseFormat:'FORMAT_XML'}),
    })
    if (response.ok) {
      const {rawData}=await response.json()
      if (typeof rawData==='string' && rawData.length<=1_000_000) {
        return c.json({company:indexedCompany(Buffer.from(rawData,'base64').toString('utf8'),page)})
      }
    }
  } catch { /* A partner can still supply the description. */ }
  return c.json({message:'Яндекс не вернул описание. Попробуйте позже.'},502)
})
