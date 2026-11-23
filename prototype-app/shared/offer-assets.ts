export type OfferAssetKind = 'photo' | 'logo' | 'artwork'

export function matchesRasterType(type: string, bytes: Uint8Array) {
  const header = String.fromCharCode(...bytes.subarray(0,64))
  switch (type) {
    case 'image/png': return header.startsWith('\x89PNG\r\n\x1a\n')
    case 'image/jpeg': return header.startsWith('\xff\xd8\xff')
    case 'image/webp': return header.startsWith('RIFF') && header.slice(8,12) === 'WEBP'
    case 'image/avif': return header.slice(4,8) === 'ftyp' && /avi[fs]/.test(header.slice(8))
    default: return false
  }
}

export const offerAssetRules = {
  photo: { label: 'Фото', width: 600, height: 400, hint: 'От 600 × 400 px. Предмет целиком, без текста и водяных знаков.' },
  logo: { label: 'Логотип', width: 128, height: 128, hint: 'От 128 × 128 px. Лучше PNG с прозрачным фоном.' },
  artwork: { label: 'Готовый оффер', width: 1200, height: 600, hint: 'От 1200 × 600 px. Формат 2:1, важное в пределах центральных 80%.' },
} as const

export function offerAssetError(kind: OfferAssetKind, type: string, size: number, width?: number, height?: number) {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(type)) return 'Выберите PNG, JPG, WebP или AVIF'
  if (!size || size > 5 * 1024 * 1024) return 'Выберите непустой файл до 5 МБ'
  const rule = offerAssetRules[kind]
  if (width !== undefined && height !== undefined) {
    if (width * height > 40_000_000) return 'Изображение слишком большое. Уменьшите его до 40 мегапикселей'
    if (width < rule.width || height < rule.height) return `Нужно изображение от ${rule.width} × ${rule.height} px`
  }
  return ''
}

export function offerCropRect(width: number, height: number, ratio: number, zoom: number, x: number, y: number) {
  const cropWidth = Math.min(width, height * ratio) / zoom
  const cropHeight = cropWidth / ratio
  return { x: (width - cropWidth) * x / 100, y: (height - cropHeight) * y / 100, width: cropWidth, height: cropHeight }
}
