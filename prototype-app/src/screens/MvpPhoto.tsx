import { useId, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { analytics } from '../analytics'
import { offerAssetError } from '../../shared/offer-assets'

import type { PromoPhoto } from '../../shared/mvp-promo'

// Keep both the working draft and its submitted snapshot within the tab's storage quota.
export async function preparePhoto(file: File, kind:'photo'|'logo'='photo', siteIcon=false): Promise<PromoPhoto> {
  const error = offerAssetError(kind, file.type, file.size)
  if (error) throw new Error(error)
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    try { await image.decode() } catch { throw new Error('Не удалось открыть файл. Выберите другое изображение.') }
    const dimensions = siteIcon && image.naturalWidth>=16 && image.naturalHeight>=16 && image.naturalWidth*image.naturalHeight<=40_000_000
      ? '' : offerAssetError(kind, file.type, file.size, image.naturalWidth, image.naturalHeight)
    if (dimensions) throw new Error(dimensions)
    const canvas = document.createElement('canvas')
    for (const limit of kind==='logo'?[256,128,64]:[960,600,360]) {
      const scale = Math.min(1, limit / Math.max(image.naturalWidth, image.naturalHeight))
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const context = canvas.getContext('2d')
      if (!context) break
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const src = canvas.toDataURL('image/webp', .86)
      if (src.startsWith('data:image/') && src.length <= (kind==='logo'?80_000:550_000)) return { name: file.name.slice(0,255), src }
    }
    throw new Error('Не удалось подготовить фото. Выберите другой файл.')
  } finally { URL.revokeObjectURL(url) }
}
export function MvpPhoto({ photo, busy, onBusy, onChange, kind='photo' }: {
  photo?: PromoPhoto; busy: boolean; onBusy: (busy: boolean) => void; onChange: (photo?: PromoPhoto) => void; kind?:'photo'|'logo'
}) {
  const id = useId()
  const [error, setError] = useState('')
  async function upload(file: File) {
    setError(''); onBusy(true)
    try { onChange(await preparePhoto(file,kind)); analytics.event('mvp_upload_result', {result:'success'}) }
    catch (e) { analytics.event('mvp_upload_result',{result:'error'}); setError(e instanceof Error ? e.message : 'Не удалось загрузить фото') }
    finally { onBusy(false) }
  }
  return <div className="mvp-upload">
    <div className="bl-row">
      <label className="bl-btn mvp-file"><ImagePlus size={18}/>{kind==='logo' ? (photo?'Заменить логотип':'Загрузить логотип') : busy ? 'Готовим фото…' : photo ? 'Заменить фото' : 'Загрузить своё фото'}
        <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" disabled={busy} aria-describedby={id} onChange={e => {
          const file = e.target.files?.[0]; e.target.value = ''; if (file) void upload(file)
        }}/>
      </label>
      {photo && <button type="button" className="bl-btn bl-btn--ghost" disabled={busy} onClick={() => { setError(''); onChange() }}>{kind==='logo'?'Убрать логотип':'Убрать фото'}</button>}
    </div>
    <small id={id} className="bl-caption">PNG, JPG, WebP или AVIF. От {kind==='logo'?'128 × 128':'600 × 400'} px, до 5 МБ.</small>
    <span className={error ? 'bl-caption bl-error' : 'bl-caption'} role="status">{error || photo?.name}</span>
  </div>
}
