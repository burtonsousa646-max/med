import {useEffect, useRef, useState} from 'react'
import {useInfiniteQuery, useQuery} from '@tanstack/react-query'
import {useSearchParams} from 'react-router'
import {Download, ImagePlus, Layers2} from 'lucide-react'
import {PartnerCabinet} from './Mvp'
import {errorMessage, mvpRequest, useMvpSession} from './MvpSession'
import {posterSource, type PosterList, type PosterSource} from '../../shared/partner-poster'
import {emptyOffer} from '../../shared/campaign-offer'
import {matchesRasterType, offerAssetError} from '../../shared/offer-assets'
import {downloadPoster, loadPosterArt, loadPosterFont, renderPoster, templates, type PosterArt, type PosterTemplate} from './partner-poster-render'
import './partner-materials.css'

const fields = [
  ['brand','Название партнёра',180], ['headline','Заголовок',100], ['subline','Подзаголовок',100],
  ['benefit','Выгода на жёлтой плашке',60], ['terms','Условия мелким шрифтом',450],
] as const

function Upload({kind,value,onChange,onBusy}:{kind:'logo'|'photo';value:string;onChange:(src:string)=>void;onBusy:(busy:boolean)=>void}) {
  const [busy,setBusy]=useState(false), [error,setError]=useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const processing = useRef(false)
  const request = useRef<AbortController|null>(null)
  const [picking,setPicking] = useState(false)
  const localMac = !!document.querySelector('meta[name="local-poster-picker"][content="macos"]')
  const label=kind==='logo' ? 'Логотип партнёра' : 'Фото или креатив'
  useEffect(()=>()=>request.current?.abort(),[])
  async function chooseOnMac() {
    if (request.current) return
    const controller = new AbortController()
    request.current=controller
    setPicking(true)
    setError('')
    try {
      const response = await fetch('/api/local-preview/poster-image',{
        method:'POST',credentials:'same-origin',headers:{'X-Poster-Picker':'1'},signal:controller.signal,
      })
      if (response.status===204) return
      if (!response.ok) {
        const failure = await response.json().catch(()=>null)
        throw new Error(failure?.message ?? 'Не удалось открыть окно выбора файла.')
      }
      const image = await response.blob()
      if (!controller.signal.aborted) await select(new File([image],'постер',{type:image.type}))
    } catch(e) { if (!controller.signal.aborted) setError(errorMessage(e)) }
    finally { request.current=null;setPicking(false) }
  }
  function open() {
    if (!dialog.current) return
    setError('')
    dialog.current.showModal()
    if (localMac) { void chooseOnMac();return }
    const picker = input.current
    if (!picker) return
    // Keep the system picker in the original click, including in embedded browsers.
    picker.click()
  }
  async function select(file:File) {
    if (processing.current) return
    processing.current=true
    setError('');setBusy(true);onBusy(true)
    try {
      const invalid=offerAssetError(kind,file.type,file.size)
      if (invalid) throw new Error(invalid)
      const header=new Uint8Array(await file.slice(0,64).arrayBuffer())
      if (!matchesRasterType(file.type,header)) throw new Error('Содержимое файла не соответствует формату изображения.')
      const src=await new Promise<string>((resolve,reject)=>{
        const reader=new FileReader()
        reader.onerror=()=>reject(new Error('Не удалось прочитать файл'))
        reader.onload=()=>resolve(String(reader.result))
        reader.readAsDataURL(file)
      })
      const image=new Image()
      image.src=src
      try { await image.decode() } catch { throw new Error('Не удалось открыть изображение') }
      const dimensions=offerAssetError(kind,file.type,file.size,image.naturalWidth,image.naturalHeight)
      if (dimensions) throw new Error(dimensions)
      onChange(src)
      dialog.current?.close()
    } catch(e) {
      setError(errorMessage(e))
      if (dialog.current && !dialog.current.open) dialog.current.showModal()
    }
    finally {processing.current=false;setBusy(false);onBusy(false)}
  }
  return <div className="poster-upload"
    onDragOver={e=>{if (e.dataTransfer.types.includes('Files')) e.preventDefault()}}
    onDrop={e=>{e.preventDefault(); const file=e.dataTransfer.files[0]; if (file) void select(file)}}
    onPaste={e=>{const file=e.clipboardData.files[0]; if (file) {e.preventDefault();void select(file)}}}>
    <span className="poster-upload-title">{label}</span>
    <button type="button" className="poster-file" aria-label={(value ? 'Заменить' : 'Загрузить')+(kind==='logo' ? ' логотип' : ' фото')}
      aria-haspopup="dialog" disabled={busy} onClick={open}>
      {value ? <img alt="" src={value}/> : <ImagePlus size={18} aria-hidden="true"/>}
      {busy ? 'Загрузка…' : value ? 'Заменить' : 'Загрузить'}
    </button>
    <dialog ref={dialog} className="poster-upload-dialog" aria-label={label} onClose={()=>request.current?.abort()} onCancel={e=>{if (processing.current) e.preventDefault()}}>
      <h2 className="bl-h4">{label}</h2>
      <div className="poster-drop">
        <span>Выберите файл или перетащите его сюда</span>
        {localMac ? <button type="button" className="bl-btn" disabled={picking || busy} onClick={()=>void chooseOnMac()}>
          {picking ? 'Открыто окно macOS…' : 'Выбрать файл'}
        </button> : <input ref={input} type="file" aria-label={label} disabled={busy} accept="image/png,image/jpeg,image/webp,image/avif"
          onChange={e=>{const file=e.currentTarget.files?.[0]; e.currentTarget.value=''; if(file) void select(file)}}/>}
      </div>
      <p className="bl-caption">Можно также вставить скопированное изображение. PNG, JPG, WebP или AVIF до 5 МБ. {kind==='photo' ? 'Фото от 600 × 400 px.' : 'Логотип от 128 × 128 px.'}</p>
      {error && <p role="alert" className="bl-error">{error}</p>}
      <button type="button" className="bl-btn bl-btn--s" disabled={busy} onClick={()=>dialog.current?.close()}>Закрыть</button>
    </dialog>
    {value && <button type="button" className="poster-remove" disabled={busy} onClick={()=>{setError('');onChange('')}}>Убрать {kind==='logo' ? 'логотип' : 'фото'}</button>}
  </div>
}

function PosterEditor({source}:{source:PosterSource}) {
  const [data,setData]=useState(source), [template,setTemplate]=useState<PosterTemplate>(templates[0])
  const [art,setArt]=useState<PosterArt|null>(null), [assetError,setAssetError]=useState(''), [attempt,retry]=useState(0)
  const [ready,setReady]=useState<{data:PosterSource;template:PosterTemplate;art:PosterArt}|null>(null)
  const [layoutError,setLayoutError]=useState(''), [downloadError,setDownloadError]=useState(''), [saving,setSaving]=useState(false)
  const [saved,setSaved]=useState('')
  const [uploads,setUploads]=useState(0)
  const canvas=useRef<HTMLCanvasElement>(null)
  function update(key:keyof PosterSource,value:string) {
    setData(previous=>({...previous,[key]:value}));setDownloadError('')
  }
  useEffect(()=>{
    let active=true
    setAssetError('');setArt(null)
    void loadPosterArt(template,data.image,data.logo).then(loaded=>{if(active)setArt(loaded)})
      .catch(()=>{if(active)setAssetError('Не удалось загрузить изображения. Повторите попытку или замените файл.')})
    return ()=>{active=false}
  },[template,data.image,data.logo,attempt])
  useEffect(()=>{
    let active=true
    setReady(null);setLayoutError('')
    if (art) {
      const copy={...data,headline:data.headline || 'Заголовок постера',benefit:data.benefit || 'Ваша выгода'}
      void loadPosterFont([copy.brand,copy.headline,copy.subline,copy.benefit,copy.terms].join(' ')).then(()=>{
        if (!active || !canvas.current) return
        renderPoster(canvas.current,copy,template,art)
        setReady({data,template,art})
      }).catch(e=>{if(active)setLayoutError(errorMessage(e))})
    }
    return ()=>{active=false}
  },[data,template,art])
  const missing=[!data.image && 'фото',!data.headline.trim() && 'заголовок',!data.benefit.trim() && 'выгоду',
    !data.logo && !data.brand.trim() && 'название партнёра или логотип'].filter(Boolean)
  const canDownload=!missing.length && !uploads && ready?.data===data && ready.template===template && ready.art===art && !saving
  async function download() {
    if (!canDownload || !art) return
    setSaving(true);setDownloadError('');setSaved('')
    try {setSaved(await downloadPoster(data,template,art))} catch(e) {setDownloadError(errorMessage(e))}
    finally {setSaving(false)}
  }
  async function openFolder() {
    setDownloadError('')
    try {
      const response=await fetch('/api/local-preview/posters/folder',{method:'POST',headers:{'X-Poster-Export':'1'}})
      if (!response.ok) throw new Error('Откройте в Finder папку «Загрузки → Постеры партнёра».')
    } catch(e) {setDownloadError(errorMessage(e))}
  }
  function uploadBusy(busy:boolean) {setUploads(n=>n+(busy ? 1 : -1))}
  return <div className="poster-workspace">
    <section className="bl-section poster-proof" aria-label="Предпросмотр постера">
      <div className="poster-proof-head"><h2 className="bl-h4">Предпросмотр</h2><span className="bl-caption">A4 · 210 × 297 мм</span></div>
      <div className="poster-desk"><canvas ref={canvas} className="poster-paper" role="img" aria-label={'Постер A4. '+data.brand+'. '+data.headline}/></div>
      <div className="poster-download">
        <button className="bl-btn bl-btn--primary" disabled={!canDownload} onClick={()=>void download()}><Download size={18}/>{saving ? 'Готовим PDF…' : 'Скачать PDF'}</button>
        <span className="bl-caption" role="status">{missing.length ? 'Для скачивания добавьте '+missing.join(', ')+'.' : 'Одна страница · 300 dpi'}</span>
      </div>
      {saved && <p className="poster-saved" role="status">Файл «{saved}» сохранён в «Загрузки → Постеры партнёра».{' '}
        <button type="button" className="poster-remove" onClick={()=>void openFolder()}>Открыть папку</button></p>}
      {assetError && <p className="bl-error" role="alert">{assetError} <button className="bl-btn bl-btn--s" onClick={()=>retry(n=>n+1)}>Повторить</button></p>}
      {(layoutError || downloadError) && <p className="bl-error" role="alert">{layoutError || downloadError}</p>}
    </section>
    <section className="bl-section pad poster-controls" aria-label="Оформление постера">
      <fieldset className="poster-templates"><legend className="bl-h4">Макет</legend>
        <div>{templates.map(t=><label key={t.id} data-chosen={template.id===t.id}>
          <input type="radio" name="poster-template" value={t.id} checked={template.id===t.id} onChange={()=>setTemplate(t)}/>
          <span className={'poster-mini '+t.id} aria-hidden="true"><i/><b/><em/></span><span>{t.label}</span>
        </label>)}</div>
      </fieldset>
      <section className="poster-images"><h2 className="bl-h4">Изображения</h2>
        <div><Upload kind="photo" value={data.image} onChange={src=>update('image',src)} onBusy={uploadBusy}/>
        <Upload kind="logo" value={data.logo} onChange={src=>update('logo',src)} onBusy={uploadBusy}/></div>
        <p className="bl-caption">PNG, JPG, WebP или AVIF до 5 МБ. Без логотипа рядом с билайном появится название партнёра.</p>
      </section>
      <section className="poster-copy"><h2 className="bl-h4">Текст постера</h2>
        {fields.map(([key,label,limit])=><label className="bl-field" key={key}><span>{label}</span>
          {key==='terms' ? <textarea className="bl-input" rows={3} maxLength={limit} value={data[key]} onChange={e=>update(key,e.target.value)}/>
            : <input className="bl-input" maxLength={limit} value={data[key]} onChange={e=>update(key,e.target.value)}/>}</label>)}
      </section>
    </section>
  </div>
}

export default function PartnerMaterials() {
  const session=useMvpSession(), profile=session.profile!
  const [params,setParams]=useSearchParams()
  const owner=[session.email,profile.inn]
  const list=useInfiniteQuery({queryKey:['poster-sources',...owner],initialPageParam:0,
    queryFn:({pageParam})=>mvpRequest<PosterList>('/poster-sources?offset='+pageParam,undefined,session.email),
    getNextPageParam:(page,_,offset)=>page.more ? offset+page.items.length : undefined,gcTime:0,retry:false})
  const items=list.data?.pages.flatMap(page=>page.items) ?? []
  const selected=params.get('campaign') || items[0]?.id || ''
  const manual=selected==='new' || (!selected && list.isSuccess)
  const detail=useQuery({queryKey:['poster-source',...owner,selected],enabled:!!selected && !manual,gcTime:0,retry:false,
    queryFn:()=>mvpRequest<PosterSource>('/poster-sources/'+encodeURIComponent(selected),undefined,session.email)})
  const source=manual ? posterSource({name:profile.company,inn:profile.inn,website:profile.website},emptyOffer) : detail.data
  return <PartnerCabinet>
    <div className="page-title staff-page-title"><h1 className="bl-display-l">Офлайн-материалы</h1></div>
    <div className="poster-source bl-section">
      <Layers2 size={23} aria-hidden="true"/><label><span className="bl-field__label">Кампания для постера</span>
      <select className="bl-input" value={manual ? 'new' : selected} onChange={e=>setParams({campaign:e.target.value},{replace:true})}>
        {!selected && !manual && <option value="">Выберите кампанию</option>}
        {selected && !manual && !items.some(i=>i.id===selected) && <option value={selected}>{detail.data?.headline || 'Выбранная кампания'}</option>}
        {items.map(item=><option key={item.id} value={item.id}>{[item.title,item.code].filter(Boolean).join(' · ')}</option>)}
        <option value="new">Создать без кампании</option>
      </select></label>
      {list.hasNextPage && <button className="bl-btn bl-btn--s" disabled={list.isFetchingNextPage} onClick={()=>void list.fetchNextPage()}>Ещё кампании</button>}
    </div>
    {list.error && <p role="alert">{errorMessage(list.error)} <button className="bl-btn bl-btn--s" onClick={()=>void list.refetch()}>Повторить загрузку списка</button></p>}
    {!manual && detail.error && <p role="alert">{errorMessage(detail.error)} <button className="bl-btn bl-btn--s" onClick={()=>void detail.refetch()}>Повторить</button></p>}
    {!source && !list.error && !detail.error && <p role="status">Загружаем данные для постера…</p>}
    {source && <PosterEditor key={manual ? 'new' : selected} source={source}/>}
  </PartnerCabinet>
}
