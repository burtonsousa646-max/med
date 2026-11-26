import { Resolver } from 'node:dns/promises'
import { request as http } from 'node:http'
import { request as https } from 'node:https'
import { BlockList, isIP } from 'node:net'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { normalizeBusinessWebsite, offerSourceHint } from '../shared/campaign-business.ts'
import { siteOfferFields } from '../shared/partner-campaign-draft.ts'

type Resource = { url: URL; mime: string; body: Buffer }
class SiteAccessDenied extends Error {}
const maxBytes = 1024 * 1024
const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/svg+xml', 'image/x-icon'])
const blocked = new BlockList()
for (const [network, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3],
] as const) blocked.addSubnet(network, bits)

export function publicSiteAddress(address: string) {
  return isIP(address) === 4 && !blocked.check(address)
}

async function readSite(url: URL, kind: 'html' | 'image', signal: AbortSignal, redirects = 3): Promise<Resource> {
  signal.throwIfAborted()
  if (!['https:', 'http:'].includes(url.protocol) || url.port || url.username || url.password || isIP(url.hostname)) {
    throw new Error('Unsupported URL')
  }
  // shortcut: public IPv4 only, add pinned public IPv6 routing when IPv6-only sites are needed.
  const resolver = new Resolver({ timeout: 1500, tries: 1 })
  const addresses = await resolver.resolve4(url.hostname)
  if (!addresses.length || addresses.some(address => !publicSiteAddress(address))) throw new Error('Private address')
  const request = url.protocol === 'https:' ? https : http
  const response = await new Promise<Awaited<ReturnType<typeof collect>>>((resolve, reject) => {
    request(url, {
      signal, agent: false, family: 4,
      lookup: (_hostname, _options, done) => done(null, addresses[0], 4),
      headers: { 'user-agent': 'MED Offer Preview', accept: kind === 'html' ? 'text/html' : 'image/*', 'accept-encoding': 'identity' },
    }, res => void collect(res, kind).then(resolve, reject)).on('error', reject).end()
  })
  if (response.location !== undefined) {
    if (!redirects) throw new Error('Too many redirects')
    return readSite(new URL(response.location, url), kind, signal, redirects - 1)
  }
  if (!response.body) throw new Error('Missing body')
  return { url, mime: response.mime, body: response.body }
}

async function collect(res: import('node:http').IncomingMessage, kind: 'html' | 'image') {
  const status = res.statusCode ?? 0
  if (status === 401 || status === 403) {
    res.destroy()
    throw new SiteAccessDenied()
  }
  if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
    res.destroy()
    return { location: res.headers.location } as const
  }
  const type = res.headers['content-type']?.split(';')[0].trim().toLowerCase() || ''
  const mime = /^(image\/(vnd\.microsoft\.icon|ico)|application\/octet-stream)$/.test(type) && kind==='image' ? 'image/x-icon' : type
  if (status !== 200 || Number(res.headers['content-length']) > maxBytes
    || (kind === 'html' ? mime !== 'text/html' : !imageTypes.has(mime))) {
    res.destroy()
    throw new Error('Unsupported response')
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of res) {
    size += chunk.length
    if (size > maxBytes) throw new Error('Response too large')
    chunks.push(chunk)
  }
  const body=Buffer.concat(chunks)
  if(mime==='image/x-icon' && (body.length<6 || body.readUInt32LE(0)!==65536 || !body.readUInt16LE(4))) throw new Error('Invalid icon')
  return { mime, body }
}

function decodeAttribute(value: string) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|nbsp|laquo|raquo|ndash|mdash|#\d{1,7}|#x[\da-f]{1,6});/gi, entity => {
    const name = entity.slice(1, -1).toLowerCase()
    if (!name.startsWith('#')) return ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp:' ', laquo:'«', raquo:'»', ndash:'–', mdash:'—' })[name] ?? entity
    const code = name.startsWith('#x') ? parseInt(name.slice(2), 16) : Number(name.slice(1))
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity
  })
}

export function siteCandidates(html: string, page: URL) {
  const logos: string[] = [], icons: string[] = [], covers: string[] = [], photos: string[] = []
  const add = (list: string[], value?: string) => {
    if (!value || list.length >= 6 || value.length > 2048) return
    try {
      const url = new URL(value.trim(), page)
      url.hash = ''
      if (['http:', 'https:'].includes(url.protocol) && !list.includes(url.href)) list.push(url.href)
    } catch { /* malformed asset URL */ }
  }
  // shortcut: inspect static head tags, JSON-LD and img tags, add a full HTML parser if extraction expands.
  const inertSvg = (svg: string) => !/<(?:script|foreignObject)\b|<!|\son[a-z]+\s*=/i.test(svg)
  const markup = html.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, svg => inertSvg(svg) ? svg : '')
    .replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, (match, tag) => {
    if (tag?.toLowerCase() === 'script' && /^<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["']/i.test(match)) {
      try {
        const walk = (value: unknown, depth: number) => {
          if (!value || typeof value !== 'object' || depth > 8) return
          for (const [key, child] of Object.entries(value)) {
            if (key === 'logo') {
              const entry = child as { url?: string; contentUrl?: string } | null
              const source = typeof child === 'string' ? child : entry?.url ?? entry?.contentUrl
              if (typeof source === 'string') add(logos, source)
            }
            walk(child, depth + 1)
          }
        }
        walk(JSON.parse(match.slice(match.indexOf('>') + 1, match.lastIndexOf('<'))), 0)
      } catch { /* invalid structured data */ }
    }
    return ''
  })
  const meta = new Map<string, string>()
  const clean = (value = '') => value.replace(/\s+/g, ' ').trim()
  const text = (value?: string) => clean(decodeAttribute((value || '').replace(/<[^>]+>/g, ' ')))
  for (const tag of markup.matchAll(/<(meta|link|img)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi)) {
    const attrs = Object.fromEntries([...tag[0].slice(tag[1].length + 1).matchAll(/([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
      .map(([, name, double, single, bare]) => [name.toLowerCase(), decodeAttribute(double ?? single ?? bare)]))
    switch (tag[1].toLowerCase()) {
      case 'meta':
        if (attrs.content) meta.set((attrs.property || attrs.name || '').toLowerCase(), clean(attrs.content))
        if (/^logo$/i.test(attrs.itemprop ?? '') || /^(?:og:logo|logo)$/i.test(attrs.property ?? attrs.name ?? '')) add(logos, attrs.content)
        if (/^(?:og:image(?::(?:url|secure_url))?|twitter:image(?::src)?)$/i.test(attrs.property ?? attrs.name ?? '')) add(covers, attrs.content)
        break
      case 'link':
        if (/^logo$/i.test(attrs.itemprop ?? '')) add(logos, attrs.href)
        if (/\b(?:icon|apple-touch-icon)\b/i.test(attrs.rel ?? '')) add(icons, attrs.href)
        if (attrs.rel?.toLowerCase() === 'image_src') add(covers, attrs.href)
        break
      case 'img': {
        const src = attrs['data-src'] || attrs['data-lazy-src'] || attrs.src || attrs.srcset?.trim().split(/[\s,]+/)[0]
        const hint = [attrs.class, attrs.id, attrs.alt, attrs.itemprop, src].join(' ')
        if (/logo|логотип/i.test(hint)) add(logos, src)
        else if (!/icon|avatar|favicon|pixel|counter|sprite|badge/i.test(hint)
          && (!attrs.width || Number(attrs.width) >= 160) && (!attrs.height || Number(attrs.height) >= 100)) add(photos, src)
        break
      }
    }
  }
  const embeddedLogos = [...markup.matchAll(/<svg\b[^>]*(?:\bclass|\bid|\baria-label)\s*=\s*["'][^"']*(?:logo|логотип)[^"']*["'][^>]*>[\s\S]*?<\/svg>/gi)]
    .map(match => match[0])
    .filter(svg => svg.length < 48_000 && /<(?:path|rect|circle|polygon|image)\b/i.test(svg)
      && inertSvg(svg))
    .slice(0, 1)
    .map(svg => ({
      kind: 'logo', source: 'brand', type: 'image/svg+xml',
      base64: Buffer.from(svg.replace(/^<svg\b(?![^>]*\bxmlns=)/i, '<svg xmlns="http://www.w3.org/2000/svg"')).toString('base64'),
    }))
  const unique = (urls: string[]) => [...new Set(urls)]
  const logo = unique([...logos, ...icons])
  const title = text(markup.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1])
  const heading = text(markup.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1])
  const content = markup.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? markup
  const paragraphs = content.replace(/<(head|nav|footer|aside|template|noscript|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .split(/<\/?(?:h[1-6]|p|div|li|section|article|br)\b[^>]*>/i)
  const offers = new Map<string,string>()
  for (const paragraph of paragraphs) {
    const line=text(paragraph).replace(/^[«“„"]|[»”"]$/g,'').trim()
    if (line.length > 300 || !/промокод/i.test(line) || !line.includes('%')) continue
    const {off,code}=siteOfferFields({subject:line,name:'',description:''})
    if (!off || !code) continue
    const key=off+'/'+code
    if (!offers.has(key)) offers.set(key,line)
    if (offers.size>1) break
  }
  const profile = {
    name: (meta.get('og:site_name') || title).slice(0, 80),
    subject: (heading || meta.get('og:title') || title).slice(0, 100),
    description: (meta.get('description') || meta.get('og:description') || '').slice(0, 300),
    ...(offers.size===1 && {offerText:[...offers.values()][0]}),
  }
  return { profile, logo, brand: logos, embeddedLogos, creative: unique([...covers, ...photos]).filter(url => !logo.includes(url)) }
}

export async function discoverSiteAssets(website: string, read = readSite, profileOnly = false, brandOnly = false) {
  const signal = AbortSignal.timeout(8500)
  const page = await read(new URL(website), 'html', signal)
  const candidates = siteCandidates(page.body.toString('utf8'), page.url)
  if (profileOnly) return { profile: candidates.profile, assets: [] }
  const kinds:('logo'|'creative')[]=brandOnly?['logo']:['logo','creative']
  const assets = await Promise.all(kinds.flatMap(kind =>
    candidates[kind].slice(0, kind === 'logo' ? 3 : 5).map(async url => {
      try {
        const image = await read(new URL(url), 'image', signal)
        const source = kind === 'creative' ? 'photo' : candidates.brand.includes(url) ? 'brand' : 'icon'
        return { kind, source, type: image.mime, base64: image.body.toString('base64') }
      } catch { return null }
    })))
  const logoAssets = assets.filter(asset => asset?.kind === 'logo')
  const logos=[...logoAssets.filter(asset=>asset?.source==='brand'),...candidates.embeddedLogos,...logoAssets.filter(asset=>asset?.source==='icon')]
  const conventionalIcon=new URL('/favicon.ico',page.url)
  if(brandOnly && !logos.length && !candidates.logo.includes(conventionalIcon.href)){
    try{
      const icon=await read(conventionalIcon,'image',signal)
      logos.push({kind:'logo',source:'icon',type:icon.mime,base64:icon.body.toString('base64')})
    }catch{ /* A logo is optional. */ }
  }
  return {
    profile: candidates.profile,
    assets: logos.slice(0, 2)
      .concat(assets.filter(asset => asset?.kind === 'creative').slice(0, 3)).filter(asset => asset !== null),
  }
}

let active = 0
let windowStart = 0
let requests = 0
export const campaignSite = new Hono().post('/site-assets', bodyLimit({
  maxSize: 1024,
  onError: c => c.json({ message: 'Адрес сайта слишком длинный' }, 413),
}), async c => {
  if (c.req.header('content-type')?.split(';')[0].trim() !== 'application/json') {
    return c.json({ message: 'Укажите адрес сайта компании' }, 400)
  }
  const body = await c.req.json<{ website?: unknown; profileOnly?: unknown; brandOnly?:unknown }>().catch(() => null)
  const website = typeof body?.website === 'string' ? normalizeBusinessWebsite(body.website) : ''
  if (!website) return c.json({ message: 'Укажите адрес сайта компании' }, 400)
  const profileOnly = body?.profileOnly === true
  const brandOnly=body?.brandOnly===true
  const hint = (profileOnly || brandOnly) && offerSourceHint(new URL(website))
  if (hint) return c.json({ message: hint }, 422)
  if (Date.now() - windowStart >= 60_000) { windowStart = Date.now(); requests = 0 }
  if (active >= 3 || requests >= 30) return c.json({ message: 'Импорт занят. Попробуйте через минуту' }, 429)
  requests++
  active++
  try {
    return c.json(await discoverSiteAssets(website, readSite, profileOnly, brandOnly))
  } catch (error) {
    if ((profileOnly||brandOnly) && error instanceof SiteAccessDenied) {
      return c.json({ message: 'Сайт отклонил запрос на чтение. Вставьте текст предложения или укажите другую ссылку.' }, 422)
    }
    return c.json({ message: profileOnly||brandOnly
      ? 'Страница недоступна для автоматического чтения. Попробуйте другую ссылку или вставьте текст предложения.'
      : 'Не удалось открыть сайт. Проверьте адрес или загрузите файлы вручную' }, 422)
  } finally {
    active--
  }
})
