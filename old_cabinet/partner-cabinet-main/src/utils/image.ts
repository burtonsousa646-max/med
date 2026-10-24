/** Подготовка загруженного изображения бренда: уменьшаем и сжимаем, чтобы data-URL не раздувал
 *  localStorage (там живёт вся демо-база). SVG сохраняем как есть, если он небольшой. */

const MAX_SIDE = 640
const MAX_SVG_BYTES = 200_000
export const MAX_UPLOAD_BYTES = 8_000_000
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Не удалось открыть изображение'))
    img.src = src
  })
}

export async function prepareBrandImage(file: File): Promise<string> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) throw new Error('Подойдут PNG, JPG, WEBP или SVG')
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Файл больше 8 МБ — уменьшите изображение')

  if (file.type === 'image/svg+xml') {
    if (file.size > MAX_SVG_BYTES) throw new Error('SVG слишком тяжёлый — сохраните в PNG')
    return readAsDataUrl(file)
  }

  const img = await loadImage(await readAsDataUrl(file))
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Не удалось обработать изображение')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  // Логотипы часто с прозрачностью — сохраняем PNG; фото — JPEG.
  return file.type === 'image/jpeg' ? canvas.toDataURL('image/jpeg', 0.86) : canvas.toDataURL('image/png')
}
