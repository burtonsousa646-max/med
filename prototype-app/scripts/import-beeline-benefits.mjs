import assert from 'node:assert/strict'
import { isDeepStrictEqual } from 'node:util'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'

const origin = 'https://moskva.beeline.ru'
const source = origin + '/customers/products/services/benefits/'
const root = new URL('../', import.meta.url)
async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  assert.ok(response.ok, `Не удалось скачать ${url}: ${response.status}`)
  return response
}
const feed = await (await get(origin + '/api/benefits/feed/')).json()
assert.ok(Array.isArray(feed.benefits), 'В ответе нет benefits')
const offers = feed.benefits.filter(o => o.type === 'offer')
assert.ok(offers.length > 0, 'Пустой импорт: текущий каталог сохранён')
assert.equal(new Set(offers.map(o => o.id)).size, offers.length, 'Повторяющиеся ID')
const images = []
const target = new URL('shared/beeline-benefits.json', root)
const previous = await readFile(target, 'utf8').catch(error => {
  if (error.code === 'ENOENT') return '{"items":[]}'
  throw error
})
const previousItems = new Map(JSON.parse(previous).items.map(item => [item.id,item]))
const items = []
for (const item of offers) {
  assert.ok(Number.isSafeInteger(item.id) && typeof item.name === 'string' && item.name.trim())
  const detail = await (await get(origin + '/api/benefits/offer/page/?id=' + item.id)).json()
  assert.equal(detail.id, item.id, 'ID условий не совпадает с карточкой')
  const imageUrl = new URL(item.bannerPictureApp)
  assert.equal(imageUrl.origin, 'https://api.partnerka.beeline.ru')
  const image = await get(imageUrl)
  const type = image.headers.get('content-type')?.split(';')[0]
  const extension = { 'image/png':'png', 'image/jpeg':'jpg', 'image/webp':'webp', 'image/avif':'avif' }[type]
  assert.ok(extension, `Неподдерживаемый тип баннера: ${type}`)
  const bytes = Buffer.from(await image.arrayBuffer())
  assert.ok(bytes.length > 0 && bytes.length <= 10 * 1024 * 1024)
  const path = `img/beeline-benefits/${item.id}.${extension}`
  images.push({ path, bytes })
  const old = previousItems.get(item.id)
  // Reuse editorial headlines while the underlying offer and its terms still match.
  const catalog = old?.name === item.name && isDeepStrictEqual(old.partner, item.partner)
    && isDeepStrictEqual(old.detail, detail) ? old.catalog : undefined
  items.push({ ...item, detail, image:'/' + path, catalog })
}
// Write the manifest last: a failed download leaves the previous catalogue usable.
await mkdir(new URL('public/img/beeline-benefits/', root), { recursive:true })
for (const {path,bytes} of images) await writeFile(new URL('public/' + path, root), bytes)
await writeFile(new URL(target.href + '.tmp'), JSON.stringify({source, fetchedAt:new Date().toISOString(), items}, null, 2) + '\n')
await rename(new URL(target.href + '.tmp'), target)
console.log(`Сохранено офферов: ${items.length}; подписок пропущено: ${feed.benefits.length - items.length}`)
