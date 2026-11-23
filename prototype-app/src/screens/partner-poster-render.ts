import '@fontsource-variable/golos-text'
import type { PosterSource } from '../../shared/partner-poster'
import greyMark from '../assets/print/beeline-grey.png'
import paperMark from '../assets/print/beeline-paper.png'
import darkMark from '../assets/print/beeline-white.png'
import star from '../assets/print/star.png'
import spark from '../assets/print/spark.png'
import heart from '../assets/print/heart.png'

// Coordinates follow the four A-format examples on pages 3–4 of the partner print guide.
export const templates = [
  {id:'top-grey', label:'Сверху · серый', background:'#e3e3e3', mark:greyMark, object:star, top:true, flipX:false, flipY:false, sticker:[419,314,112,124], badge:[119,732]},
  {id:'top-white', label:'Сверху · белый', background:'#ffffff', mark:paperMark, object:star, top:true, flipX:false, flipY:true, sticker:[405,680,112,124], badge:[94,340]},
  {id:'bottom-dark', label:'Снизу · чёрный', background:'#131514', mark:darkMark, object:spark, top:false, flipX:true, flipY:false, sticker:[66,106,110,120], badge:[309,510]},
  {id:'bottom-white', label:'Снизу · белый', background:'#ffffff', mark:paperMark, object:heart, top:false, flipX:true, flipY:true, sticker:[114,492,99,100], badge:[309,133]},
] as const
export type PosterTemplate = typeof templates[number]
type Context = CanvasRenderingContext2D
type Box = {x:number; y:number; width:number; height:number}
const family = '"Golos Text Variable", sans-serif'
const width = 620, height = 877
const frame = new Path2D('M 158 1 L 422 53 C 452 59 473 80 475 112 L 487 385 C 490 430 453 459 413 450 L 47 369 C 11 362 -9 328 3 294 L 92 45 C 102 16 127 -4 158 1 Z')

export async function loadPosterImage(url:string) {
  if (!url) return null
  const image = new Image()
  image.src = url
  await image.decode()
  return image
}

// Transparent wordmarks sometimes arrive in a single colour for the opposite background.
function logoBacking(image:HTMLImageElement|null, dark:boolean) {
  if (!image) return ''
  const sample=document.createElement('canvas')
  sample.width=sample.height=32
  const ctx=sample.getContext('2d')
  if (!ctx) return ''
  ctx.drawImage(image,0,0,32,32)
  const {data}=ctx.getImageData(0,0,32,32)
  let ink=0, lowContrast=0, clear=0
  for (let i=0;i<data.length;i+=4) {
    const alpha=data[i+3]/255
    if (alpha<.1) { clear++;continue }
    const lightness=(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2])/255
    ink+=alpha
    if (dark ? lightness<.32 : lightness>.72) lowContrast+=alpha
  }
  return clear && ink && lowContrast/ink>.6 ? (dark ? '#ffffff' : '#161616') : ''
}

export async function loadPosterArt(template:PosterTemplate, photo:string, logo:string) {
  const [mark, ornament, image, partner] = await Promise.all([template.mark,template.object,photo,logo].map(loadPosterImage))
  return {mark:mark!,ornament:ornament!,image,partner,backing:logoBacking(partner,template.id==='bottom-dark')}
}
export type PosterArt = Awaited<ReturnType<typeof loadPosterArt>>

export async function loadPosterFont(text:string) {
  await Promise.all([400,700,900].map(weight => document.fonts.load(weight+' 32px '+family,text || 'Аа')))
}

function fitText(ctx:Context, text:string, box:Box, max:number, min:number, weight:number, color:string, label:string) {
  const words = text.trim().split(/\s+/u)
  if (!words[0]) return
  for (let size=max; size>=min; size--) {
    ctx.font = weight+' '+size+'px '+family
    const lines:string[] = []
    let line = ''
    for (const word of words) {
      const next = line ? line+' '+word : word
      if (ctx.measureText(next).width <= box.width) { line=next; continue }
      if (line) lines.push(line)
      line=''
      for (const letter of word) {
        if (line && ctx.measureText(line+letter).width>box.width) { lines.push(line); line='' }
        line+=letter
      }
    }
    if (line) lines.push(line)
    const leading = size * 1.02
    const metrics = ctx.measureText('ЙДруg')
    const inkHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
    const blockHeight = inkHeight + (lines.length-1)*leading
    if (blockHeight>box.height) continue
    ctx.fillStyle=color
    ctx.textAlign='center'
    ctx.textBaseline='alphabetic'
    const baseline = box.y+(box.height-blockHeight)/2+metrics.actualBoundingBoxAscent
    lines.forEach((value,i)=>ctx.fillText(value,box.x+box.width/2,baseline+i*leading))
    return
  }
  throw new Error('Сократите текст в поле «'+label+'», чтобы он поместился на постере.')
}

function imageArea(ctx:Context, template:PosterTemplate, photo:HTMLImageElement|null) {
  const x=66, y=template.top ? 339 : 129, w=488, h=452
  ctx.save()
  ctx.translate(x,y)
  // Mirror the mask only. Partner artwork keeps its original orientation.
  const mask = new Path2D()
  mask.addPath(frame,new DOMMatrix().translate(template.flipX ? w : 0,template.flipY ? h : 0)
    .scale(template.flipX ? -1 : 1,template.flipY ? -1 : 1))
  ctx.clip(mask)
  if (photo) {
    // Uploaded cutouts can be transparent. Keep the shaped image area visible behind them.
    ctx.fillStyle='#eee9df'
    ctx.fillRect(0,0,w,h)
    const ratio = Math.max(w/photo.naturalWidth,h/photo.naturalHeight)
    const iw=photo.naturalWidth*ratio, ih=photo.naturalHeight*ratio
    ctx.drawImage(photo,(w-iw)/2,(h-ih)/2,iw,ih)
  } else {
    ctx.fillStyle=template.id==='bottom-dark' ? '#373939' : '#ede9df'
    ctx.fillRect(0,0,w,h)
    fitText(ctx,'Фото для постера',{x:30,y:175,width:w-60,height:80},28,18,700,template.id==='bottom-dark' ? '#dadada' : '#787369','Фото')
  }
  ctx.restore()
}

export function renderPoster(canvas:HTMLCanvasElement, data:PosterSource, template:PosterTemplate, art:PosterArt, print=false) {
  canvas.width=print ? 2480 : 930
  canvas.height=print ? 3508 : 1315
  const ctx=canvas.getContext('2d')
  if (!ctx) throw new Error('Не удалось открыть макет в браузере')
  ctx.scale(canvas.width/width,canvas.height/height)
  ctx.imageSmoothingQuality='high'
  ctx.fillStyle=template.background
  ctx.fillRect(0,0,width,height)
  const dark=template.id==='bottom-dark'
  const ink=dark ? '#fff' : '#141414'
  const partnerWidth=art.partner ? Math.min(168, 43*art.partner.naturalWidth/art.partner.naturalHeight) : 150
  const left=(width-166-42-partnerWidth)/2
  ctx.drawImage(art.mark,left,43.5,166,37)
  ctx.fillStyle=ink
  ctx.fillRect(left+185,46,1.4,32)
  const px=left+208
  if (art.partner) {
    const ph=partnerWidth*art.partner.naturalHeight/art.partner.naturalWidth
    if (art.backing) {
      ctx.fillStyle=art.backing
      ctx.beginPath();ctx.roundRect(px-5,62-ph/2-4,partnerWidth+10,ph+8,4);ctx.fill()
    }
    ctx.drawImage(art.partner,px,62-ph/2,partnerWidth,ph)
  } else fitText(ctx,data.brand,{x:px,y:35,width:partnerWidth,height:54},26,7,700,ink,'Название партнёра')

  imageArea(ctx,template,art.image)
  const [sx,sy,sw,sh]=template.sticker
  ctx.drawImage(art.ornament,sx,sy,sw,sh)
  const [bx,by]=template.badge
  if (data.benefit.trim()) {
    ctx.fillStyle='#ffca08'
    ctx.beginPath();ctx.roundRect(bx,by,216,65,13);ctx.fill()
    fitText(ctx,data.benefit,{x:bx+9,y:by+3,width:198,height:59},32,14,700,'#141414','Выгода')
  }
  const ty=template.top ? 105 : 604
  fitText(ctx,data.headline,{x:30,y:ty,width:560,height:data.subline.trim() ? 143 : 183},70,20,900,ink,'Заголовок')
  fitText(ctx,data.subline,{x:32,y:ty+145,width:556,height:52},32,14,700,ink,'Подзаголовок')
  fitText(ctx,data.terms,{x:36,y:823,width:548,height:36},13,8,400,dark ? '#c1c1c1' : '#565656','Условия')
}

export async function downloadPoster(data:PosterSource, template:PosterTemplate, art:PosterArt) {
  const canvas=document.createElement('canvas')
  renderPoster(canvas,data,template,art,true)
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value ? resolve(value) : reject(new Error('Не удалось сохранить постер')), 'image/jpeg',.98))
  const title=[data.brand,data.headline].filter(Boolean).join(' — ')
  const brand=Array.from(data.brand.normalize('NFC').replace(/[^\p{L}\p{N} -]+/gu,' ').replace(/\s+/g,' ').trim()).slice(0,40).join('').trim() || 'Постер'
  const name=brand+' — A4 — '+template.label.toLowerCase().replace(' · ',' ')+'.pdf'
  if (document.querySelector('meta[name="local-poster-downloads"]')) {
    const form=new FormData()
    form.set('image',blob,'poster.jpg')
    form.set('name',name)
    form.set('title',title)
    const response=await fetch('/api/local-preview/posters',{method:'POST',headers:{'X-Poster-Export':'1'},body:form})
    if (!response.ok) throw new Error((await response.json().catch(()=>null))?.message || 'Не удалось сохранить файл в «Загрузки».')
    const saved:{name:string}=await response.json()
    return saved.name
  }
  const {createPosterPdf}=await import('../../shared/poster-pdf')
  const bytes=await createPosterPdf(await blob.arrayBuffer(),title)
  const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/pdf'}))
  const link=document.createElement('a')
  link.href=url
  link.download=name
  document.body.append(link);link.click();link.remove()
  window.setTimeout(()=>URL.revokeObjectURL(url),60_000)
  return ''
}
