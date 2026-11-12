import { useEffect, useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { fetchCampaignSiteAssets, type S } from '../api'

type Candidate = { file: File; url: string; kind: S['SiteAsset']['kind']; source: S['SiteAsset']['source'] }
const labels = { logo: 'Логотип', creative: 'Изображение' }

async function prepareAsset(asset: S['SiteAsset'], index: number) {
  const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg' }
  const extension = extensions[asset.type]
  if (!extension) throw new Error('Unsupported image')
  const bytes = Uint8Array.from(atob(asset.base64), byte => byte.charCodeAt(0))
  const name = 'сайт-' + asset.kind + '-' + (index + 1)
  const blob = new Blob([bytes], { type: asset.type })
  const source = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = source
    await image.decode()
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Empty image')
    if (extension !== 'svg') return new File([blob], name + '.' + extension, { type: asset.type })
    // SVG stays in image context and only the rasterized PNG enters the draft.
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 768 / Math.max(image.naturalWidth, image.naturalHeight))
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas unavailable')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const png = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!png) throw new Error('Invalid image')
    return new File([png], name + '.png', { type: 'image/png' })
  } finally { URL.revokeObjectURL(source) }
}

export function CampaignSiteAssets({ website, logo, image, onLogo, onImage, onAutoLogo, onLoading, disabled, hidden }: {
  website: string; logo: File | null; image: File | null; onLogo: (value: File) => void;
  onImage: (value: File) => void; onAutoLogo: (value: File) => void; onLoading: (loading: boolean) => void; disabled: boolean; hidden: boolean
}) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const pending = useRef<AbortController | null>(null)
  useEffect(() => {
    void load()
    return () => { pending.current?.abort(); pending.current = null; onLoading(false) }
  }, [website])
  useEffect(() => () => candidates.forEach(({ url }) => URL.revokeObjectURL(url)), [candidates])

  async function load() {
    if (pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setLoading(true)
    onLoading(true)
    setStatus('Ищем изображения на сайте…')
    setCandidates([])
    try {
      const assets = await fetchCampaignSiteAssets(website, AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]))
      const files = await Promise.allSettled(assets.map(prepareAsset))
      if (controller.signal.aborted) return
      const found = files.flatMap((file, index) => file.status === 'fulfilled'
        ? [{ file: file.value, url: URL.createObjectURL(file.value), kind: assets[index].kind, source: assets[index].source }] : [])
      const siteLogo = found.find(asset => asset.kind === 'logo' && asset.source === 'brand')
      if (siteLogo) onAutoLogo(siteLogo.file)
      setCandidates(found)
      setStatus(found.length ? 'Выберите материалы для оффера' : 'Подходящих файлов нет. Можно загрузить их вручную')
    } catch (error) {
      if (!controller.signal.aborted) setStatus(error instanceof Error && !['TypeError', 'TimeoutError'].includes(error.name)
        ? error.message : 'Сайт не ответил. Попробуйте ещё раз или загрузите файлы вручную')
    } finally {
      if (!controller.signal.aborted) { pending.current = null; setLoading(false); onLoading(false) }
    }
  }

  return <section className="campaign-site-assets" hidden={hidden} aria-label="Материалы с сайта" aria-busy={loading}>
    <button type="button" className="campaign-site-assets__load" disabled={disabled || loading} onClick={() => void load()}>
      <ImagePlus size={16} aria-hidden="true" /> {loading ? 'Ищем на сайте…' : candidates.length ? 'Обновить материалы с сайта' : 'Взять материалы с сайта'}
    </button>
    <p role="status">{!loading && candidates.some(candidate => candidate.kind === 'logo' && candidate.file === logo)
      ? 'Логотип добавлен с сайта' : status}</p>
    {candidates.length > 0 && <div className="campaign-site-assets__choices">
      {candidates.map(({ file, url, kind }, index) => <button key={url} type="button" disabled={disabled}
        aria-label={labels[kind] + ' с сайта, вариант ' + (index + 1)} aria-pressed={file === (kind === 'logo' ? logo : image)}
        onClick={() => (kind === 'logo' ? onLogo : onImage)(file)}>
        <img src={url} alt="" /><span>{labels[kind]}{file === logo ? ' ✓' : ''}</span>
      </button>)}
    </div>}
  </section>
}
