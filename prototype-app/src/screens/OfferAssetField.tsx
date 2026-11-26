import { useEffect, useId, useRef, useState } from 'react'
import { Check, Crop, ImagePlus } from 'lucide-react'
import { analytics, type EventParams } from '../analytics'
import { offerAssetError, offerAssetRules, offerCropRect, type OfferAssetKind } from '../../shared/offer-assets'
import './offer-editor.css'

export function OfferAssetField({ kind, file, preview, onChange, track = false }: {
  kind: OfferAssetKind; file: File | null; preview?: string; onChange: (file: File | null) => void; track?: boolean
}) {
  const rule = offerAssetRules[kind]
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const cropButton = useRef<HTMLButtonElement>(null)
  const version = useRef(0)
  const original = useRef<{ file: File; output: File } | null>(null)
  const [source, setSource] = useState<{ file: File; image: HTMLImageElement } | null>(null)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [ratio, setRatio] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [x, setX] = useState(50)
  const [y, setY] = useState(50)
  const rect = source ? offerCropRect(source.image.naturalWidth, source.image.naturalHeight, ratio, zoom, x, y) : null
  const outputWidth = rect ? Math.round(Math.min(1600, 1600 * ratio, rect.width)) : 0
  const outputHeight = Math.round(outputWidth / ratio)
  const cropError = rect && (outputWidth < rule.width || outputHeight < rule.height) ? `В кадре должно остаться не меньше ${rule.width} × ${rule.height} px. Уменьшите масштаб или выберите другой формат` : ''
  const feedback = (message: string, reason?: EventParams['reason']) => {
    setError(message); input.current?.setCustomValidity(message)
    if (track && kind !== 'artwork' && reason) analytics.event('v4_upload_result', { field: kind === 'photo' ? 'image' : 'logo', result: 'error', reason })
  }
  useEffect(() => () => { version.current++ }, [])
  useEffect(() => {
    if (!source || !rect || !canvas.current) return
    const target = canvas.current
    target.width = Math.max(1, Math.round(Math.min(720, 720 * ratio)))
    target.height = Math.max(1, Math.round(target.width / ratio))
    target.getContext('2d')?.drawImage(source.image, rect.x, rect.y, rect.width, rect.height, 0, 0, target.width, target.height)
  }, [source, ratio, zoom, x, y])

  async function select(selected: File) {
    const token = ++version.current
    setSource(null)
    const invalid = offerAssetError(kind, selected.type, selected.size)
    if (invalid) { feedback(invalid, ['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(selected.type) ? 'size' : 'type'); return }
    setWorking(true)
    input.current?.setCustomValidity('Дождитесь проверки изображения')
    const url = URL.createObjectURL(selected)
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      if (version.current !== token) return
      const invalid = offerAssetError(kind, selected.type, selected.size, image.naturalWidth, image.naturalHeight)
      if (invalid) { feedback(invalid, 'size'); return }
      feedback('')
      setRatio(kind === 'artwork' ? 2 : image.naturalWidth / image.naturalHeight)
      setZoom(1); setX(50); setY(50)
      setSource({ file: selected, image })
      input.current?.setCustomValidity('Примените кадрирование или отмените загрузку')
      requestAnimationFrame(() => document.getElementById(id + '-crop')?.focus())
    } catch { if (version.current === token) feedback('Не удалось открыть изображение. Выберите другой файл', 'decode') }
    finally { URL.revokeObjectURL(url); if (version.current === token) setWorking(false) }
  }

  function cancel() {
    version.current++; setSource(null); setWorking(false); feedback('')
    if (input.current) input.current.value = ''
    requestAnimationFrame(() => (cropButton.current ?? input.current)?.focus())
  }

  async function apply() {
    if (!source || !rect || cropError) return
    const token = version.current
    setWorking(true)
    try {
      const output = document.createElement('canvas')
      output.width = outputWidth; output.height = outputHeight
      const context = output.getContext('2d')
      if (!context) throw new Error('Canvas unavailable')
      context.drawImage(source.image, rect.x, rect.y, rect.width, rect.height, 0, 0, output.width, output.height)
      const type = kind === 'logo' || source.file.type !== 'image/jpeg' ? 'image/png' : 'image/jpeg'
      const blob = await new Promise<Blob>((resolve, reject) => output.toBlob(value => value ? resolve(value) : reject(new Error('Image unavailable')), type, .92))
      if (token !== version.current) return
      if (blob.size > 5 * 1024 * 1024) { feedback('Результат больше 5 МБ. Выберите другой файл', 'size'); return }
      const result = new File([blob], source.file.name.replace(/\.[^.]+$/, '') + '-кадр.' + (type === 'image/png' ? 'png' : 'jpg'), { type })
      original.current = { file: source.file, output: result }
      feedback(''); onChange(result); setSource(null)
      if (track && kind !== 'artwork') analytics.event('v4_upload_result', { field: kind === 'photo' ? 'image' : 'logo', result: 'success' })
      if (input.current) input.current.value = ''
      requestAnimationFrame(() => cropButton.current?.focus())
    } catch { if (token === version.current) feedback('Не удалось сохранить кадр. Попробуйте ещё раз', 'decode') }
    finally { if (token === version.current) setWorking(false) }
  }

  return <div className="bl-field v3-upload-field offer-asset-field">
    <label><span className="bl-field__label">{rule.label}</span>
      {preview && <img className="offer-file-preview" src={preview} alt={rule.label} />}
      <span className="v3-file" data-filled={Boolean(file)}><span aria-hidden="true"><ImagePlus size={18}/>{working ? 'Проверяем…' : file ? 'Заменить файл' : 'Загрузить файл'}</span>
        {file && <small title={file.name}>{file.name}</small>}{file && !error && <Check size={16} aria-hidden="true"/>}
        <input ref={input} type="file" required={kind === 'artwork' && !file} aria-label={rule.label} aria-invalid={Boolean(error)} aria-describedby={id + '-help'} accept="image/png,image/jpeg,image/webp,image/avif" disabled={working}
          onInvalid={event => { event.preventDefault(); setError(event.currentTarget.validity.valueMissing ? 'Загрузите готовый оффер и примените кадрирование' : event.currentTarget.validationMessage) }} onChange={event => { const selected = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (selected) void select(selected) }}/>
      </span>
    </label>
    <span id={id + '-help'} className="v3-upload-feedback" role="status">{error || `PNG, JPG, WebP, AVIF · до 5 МБ. ${rule.hint}`}</span>
    {!source && <div className="offer-asset-actions">{file && <button ref={cropButton} type="button" className="v3-text-button" onClick={() => void select(original.current?.output === file ? original.current.file : file)}><Crop size={16}/>Кадрировать</button>}
      {(file || preview || error) && <button type="button" className="v3-text-button" onClick={() => { cancel(); original.current = null; onChange(null) }}>Удалить {kind === 'photo' ? 'фото' : kind === 'logo' ? 'логотип' : 'макет'}</button>}
    </div>}
    {source && <section id={id + '-crop'} tabIndex={-1} className="offer-crop" aria-label={'Кадрирование: ' + rule.label}>
      <p>Выберите область изображения</p>
      <canvas ref={canvas} aria-label="Предпросмотр кадрирования"/>
      {kind !== 'artwork' && <label>Формат кадра<select value={ratio} onChange={event => { setRatio(Number(event.target.value)); setZoom(1) }}>
        <option value={source.image.naturalWidth / source.image.naturalHeight}>Исходный</option>
        <option value={1}>Квадрат 1:1</option>{kind === 'photo' && <><option value={1.5}>Фото 3:2</option><option value={2}>Баннер 2:1</option></>}
      </select></label>}
      <label>Масштаб <output>{Math.round(zoom * 100)}%</output><input type="range" min={1} max={3} step={.01} value={zoom} onChange={event => setZoom(Number(event.target.value))}/></label>
      <label>По горизонтали<input type="range" min={0} max={100} value={x} onChange={event => setX(Number(event.target.value))}/></label>
      <label>По вертикали<input type="range" min={0} max={100} value={y} onChange={event => setY(Number(event.target.value))}/></label>
      <span role="status" className="v3-upload-feedback">{cropError || `Размер кадра: ${outputWidth} × ${outputHeight} px. Исходный файл сохранится в этой сессии.`}</span>
      <div className="offer-asset-actions"><button type="button" className="bl-btn bl-btn--dark" disabled={working || Boolean(cropError)} onClick={() => void apply()}>{working ? 'Сохраняем…' : 'Применить кадр'}</button><button type="button" className="bl-btn" onClick={cancel}>Отмена</button></div>
    </section>}
  </div>
}
