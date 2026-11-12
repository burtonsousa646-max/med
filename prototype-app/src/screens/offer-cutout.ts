import { useEffect, useState } from 'react'
import { requestOfferCutout } from '../api'

const maxSide = 896

function png(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG unavailable')), 'image/png')
  })
}

async function canvasFor(file: Blob) {
  const source = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = source
    await image.decode()
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Canvas unavailable')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return { canvas, context }
  } finally { URL.revokeObjectURL(source) }
}

function subjectBounds(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
  const { width, height } = canvas
  const pixels = context.getImageData(0, 0, width, height).data
  let left = width, top = height, right = -1, bottom = -1, clear = 0, solid = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = pixels[(y * width + x) * 4 + 3]
      if (alpha < 12) clear++
      if (alpha > 180) solid++
      if (alpha < 24) continue
      left = Math.min(left, x); right = Math.max(right, x)
      top = Math.min(top, y); bottom = Math.max(bottom, y)
    }
  }
  const area = width * height
  if (clear < area * .035 || solid < area * .08 || right <= left || bottom <= top) return null
  return { left, top, width: right - left + 1, height: bottom - top + 1 }
}

async function prepareCutout(file: File, signal: AbortSignal) {
  let { canvas, context } = await canvasFor(file)
  let bounds = subjectBounds(canvas, context)
  if (!bounds) {
    signal.throwIfAborted()
    const result = await requestOfferCutout(await png(canvas), signal)
    const processed = await canvasFor(result)
    canvas = processed.canvas
    context = processed.context
    bounds = subjectBounds(canvas, context)
    if (!bounds) throw new Error('No reliable mask')
  }
  signal.throwIfAborted()
  const margin = Math.max(3, Math.round(Math.max(bounds.width, bounds.height) * .035))
  const output = document.createElement('canvas')
  output.width = bounds.width + margin * 2
  output.height = bounds.height + margin * 2
  const target = output.getContext('2d')
  if (!target) throw new Error('Canvas unavailable')
  target.drawImage(canvas, bounds.left, bounds.top, bounds.width, bounds.height, margin, margin, bounds.width, bounds.height)
  return new File([await png(output)], file.name.replace(/\.[^.]+$/, '') + '-без-фона.png', { type: 'image/png' })
}

export function useOfferCutout(file: File | null, active: boolean, initialCutout?: File | null, initialKeepOriginal?: boolean) {
  const [work, setWork] = useState<{ original: File; cutout?: File; failed?: boolean } | null>(() =>
    file && initialCutout ? { original: file, cutout: initialCutout } : null)
  const [kept, setKept] = useState<File | null>(initialKeepOriginal ? file : null)
  const [attempt, retry] = useState(0)
  const current = work?.original === file ? work : null
  const cutout = current?.cutout
  const keepOriginal = Boolean(file && kept === file)
  useEffect(() => {
    if (!active || !file || cutout || keepOriginal) return
    const controller = new AbortController()
    setWork({ original: file })
    void prepareCutout(file, controller.signal).then(result => {
      if (!controller.signal.aborted) setWork({ original: file, cutout: result })
    }, () => {
      if (!controller.signal.aborted) setWork({ original: file, failed: true })
    })
    return () => controller.abort()
  }, [file, active, cutout, keepOriginal, attempt])
  return {
    cutout, keepOriginal, failed: Boolean(active && current?.failed && !keepOriginal),
    processing: Boolean(active && file && !cutout && !current?.failed && !keepOriginal),
    setKeepOriginal: (keep: boolean) => setKept(keep ? file : null),
    retry: () => retry(value => value + 1),
  }
}
