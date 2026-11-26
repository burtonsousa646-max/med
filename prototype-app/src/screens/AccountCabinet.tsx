import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { ChartColumn, Bell, BookOpen, Building2, Check, ChevronRight, FileText, Megaphone, Menu, PanelLeftClose, PanelLeftOpen, PanelsTopLeft, Search, Settings2, Store, Sun, Moon, MailOpen, UserRound, Users, X, type LucideIcon } from 'lucide-react'
import logo from '../../../design-system/assets/beeline-logo.svg'
import { Brand } from '../ui'
import { CampaignNotifications, useCampaignNotifications } from './CampaignNotifications'
import { mvpRequest, useMvpSession } from './MvpSession'
import { campaignRowPath, useCabinetData } from './cabinet-data'
import { campaignLabels, type DashboardEvent, type DashboardList, type DashboardOverview } from '../../shared/cabinet-dashboard'
import type { PartnerCampaignStatus } from '../../shared/mvp-promo'
import './v4-staff.css'
import './cabinet-dashboard.css'
import './cabinet-navigation.css'
import { CabinetGuide } from './CabinetGuide'

const partnerLinks = [
  ['/app/campaigns','мои кампании',Megaphone], ['/app/statistics','статистика',ChartColumn], ['/app/materials','офлайн-материалы',PanelsTopLeft], ['/app/company','компания',Building2],
] as const
const staffLinks = [
  ['/app/staff','кампании',Megaphone], ['/app/staff/team','сотрудники',Users],
] as const
type NavItem = readonly [string,string,LucideIcon]
type Panel = 'nav' | 'search' | 'events' | 'profile' | 'settings' | 'guide'
const searchShortcut = /Mac|iPad|iPhone/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'
function preference(key: string, fallback: string) {
  try { return localStorage.getItem('cabinet-ui/'+key) ?? fallback } catch { return fallback }
}
function usePreference(key:string, fallback:string) {
  const [value,setValue] = useState(()=>preference(key,fallback))
  function save(next:string) {
    setValue(next)
    try { localStorage.setItem('cabinet-ui/'+key,next) } catch { /* Available in this view. */ }
  }
  return [value,save] as const
}
export function CabinetDialog({title,close,children,variant='drawer'}:{title:string;close:()=>void;children:ReactNode;variant?:'drawer'|'command'|'mobile'}) {
  const ref=useRef<HTMLDialogElement>(null)
  const exit=useRef<Animation|null>(null)
  useEffect(()=>{
    const dialog=ref.current!, previous=document.activeElement
    dialog.showModal()
    dialog.querySelector<HTMLElement>('[data-dialog-focus]')?.focus({preventScroll:true})
    return ()=>{
      exit.current?.cancel()
      dialog.close()
      if(previous instanceof HTMLElement && previous.isConnected) previous.focus({preventScroll:true})
    }
  },[])
  function dismiss(){
    const dialog=ref.current
    if(!dialog || exit.current) return
    if(document.hidden || !dialog.animate || matchMedia('(prefers-reduced-motion: reduce)').matches){close();return}
    const style=getComputedStyle(dialog)
    exit.current=dialog.animate([
      {opacity:style.opacity,transform:style.transform},
      {opacity:0,transform:'translate(var(--cabinet-dialog-x,0),var(--cabinet-dialog-y,0))'},
    ],{duration:110,easing:'ease-in',fill:'forwards'})
    exit.current.onfinish=close
  }
  return <dialog ref={ref} className={'crm-dialog crm-dialog--'+variant} aria-label={title} onCancel={e=>{e.preventDefault();dismiss()}}
    onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dismiss()}}}>
    <header><h2>{title}</h2><button className="crm-icon" type="button" aria-label="Закрыть" onClick={dismiss}><X/></button></header>{children}
  </dialog>
}
export const cabinetDate = (time:number) => new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'Europe/Moscow'}).format(time)
export function CabinetEvents({items,staff,close,seen}:{items:DashboardEvent[];staff:boolean;close?:()=>void;seen?:number}) {
  const nav=useNavigate()
  if (!items.length) return <p className="crm-muted">События появятся после запуска первой кампании.</p>
  return <ol className="crm-events">{items.map(item=><li key={item.id} data-unread={seen!==undefined&&item.submittedAt>seen}>
    <span className="crm-event-icon"><FileText size={16}/></span><div><strong>{staff ? 'Получена кампания' : 'Начат запуск кампании'}</strong>
    <span>{staff ? item.name : item.code} · {cabinetDate(item.submittedAt)}</span></div>
    <button className="crm-icon" aria-label={'Открыть событие · '+(staff ? item.name : item.code)} onClick={()=>{close?.();nav((staff ? '/app/staff/' : '/app/campaigns/')+item.id)}}><ChevronRight/></button>
  </li>)}</ol>
}

export function AccountCabinet({children,logout}:{logout:ReactNode;children:ReactNode}) {
  const session=useMvpSession(), staff=!!session.role
  const [panel,setPanel]=useState<Panel|null>(null), [search,setSearch]=useState('')
  const [rail,setRail]=usePreference('rail','full'), [theme,setTheme]=usePreference('theme','light')
  const [density,setDensity]=usePreference('density','normal'), [width,setWidth]=usePreference('width','wide')
  const [orientation,setOrientation]=usePreference('navigation','vertical'), [side,setSide]=usePreference('side','left')
  const [surface,setSurface]=usePreference('surface','flat'), [palette,setPalette]=usePreference('charts','classic')
  const [seen,setSeen]=usePreference('seen/'+session.email,'0')
  const [guideSeen,setGuideSeen]=usePreference('guide/'+(staff?'staff/':'partner/')+session.email,'no')
  const [eventTab,setEventTab]=useState<'recent'|'attention'>('recent')
  const [systemDark,setSystemDark]=useState(()=>matchMedia('(prefers-color-scheme: dark)').matches)
  const location=useLocation(), nav=useNavigate()
  const panelLocation=useRef(location.key)
  const links:readonly NavItem[]=staff ? staffLinks.filter(([path])=>session.role==='admin'||!path.endsWith('/team')) : partnerLinks
  const home=links[0][0], label=staff ? 'кабинет сотрудника' : 'кабинет партнёра'
  const active=links.slice().reverse().find(([path])=>location.pathname===path||location.pathname.startsWith(path+'/')) ?? links[0]
  const profile=session.profile?.company || (session.role==='admin' ? 'Администратор' : staff ? 'Сотрудник' : session.email)
  const initials=profile.split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase()
  const events=useCabinetData<DashboardOverview>('/dashboard')
  const attentionStatus=staff?'review':'contract'
  const attention=useCabinetData<DashboardList>('/dashboard/rows?status='+attentionStatus,panel==='events'&&eventTab==='attention')
  const notices=useCampaignNotifications(session.email,!staff)
  const latest=notices.data?.pages[0]
  const unread=(events.data?.recent.filter(r=>r.submittedAt>Number(seen)).length??0)+(latest?.unread??0)
  const [readError,setReadError]=useState('')
  async function markRead(){
    try {
      if(!staff && latest?.unread && latest.items[0]){
        await mvpRequest('/notifications/read',{through:latest.items[0].eventId},session.email)
        await notices.refetch()
      }
      if(events.data?.recent[0])setSeen(String(events.data.recent[0].submittedAt))
      setReadError('')
    } catch {setReadError('Не удалось отметить уведомления. Повторите попытку.')}
  }
  const dark=theme==='dark'||(theme==='system' && systemDark)
  const close=()=>setPanel(null)
  useEffect(()=>{
    if(panelLocation.current!==location.key) setPanel(null)
    panelLocation.current=location.key
  },[location.key])
  useEffect(()=>{
    const media=matchMedia('(prefers-color-scheme: dark)'), update=()=>setSystemDark(media.matches)
    const key=(e:KeyboardEvent)=>{
      if (e.defaultPrevented || !(e.metaKey||e.ctrlKey) || e.key.toLowerCase()!=='k') return
      const modal=document.querySelector('dialog[open]')
      if (modal && !modal.querySelector('.crm-command-field')) return
      e.preventDefault();setSearch('');setPanel(p=>p==='search'?null:'search')
    }
    media.addEventListener('change',update);window.addEventListener('keydown',key)
    return ()=>{media.removeEventListener('change',update);window.removeEventListener('keydown',key)}
  },[])
  function navigation() {return <nav aria-label={label}>{links.map(([path,text,Icon])=><Link key={path} className={'crm-navlink'+(path===active[0]?' active':'')} aria-current={active[0]===path?'page':undefined} aria-label={text} title={text} onClick={close} to={path}>
    <Icon size={19}/><span>{text}</span></Link>)}</nav>}
  const openSearch=()=>{setSearch('');setPanel('search')}
  const openGuide=()=>{setGuideSeen('yes');setPanel('guide')}
  const goSearch=()=>{if(search.trim()){nav(staff ? home+'?view=list' : home,{state:{cabinetSearch:search.trim()}});close()}}
  return <div className="staff-page crm-shell ym-hide-content ym-disable-keys" data-theme={dark?'invert':undefined} data-rail={rail} data-density={density} data-width={width} data-nav={orientation} data-side={side} data-surface={surface} data-palette={palette}>
    <a href="#cabinet-content" className="crm-skip" onClick={e=>{e.preventDefault();document.getElementById('cabinet-content')?.focus()}}>К содержимому</a>
    <aside className="crm-sidebar"><Brand to={home}/>{navigation()}
      <div className="crm-sidebar-bottom"><Link className="crm-navlink" to="/market/" title="витрина предложений" aria-label="витрина предложений"><Store size={19}/><span>витрина предложений</span></Link>
      <div className="crm-signout">{logout}</div></div>
    </aside>
    <div className="crm-workspace"><header className="crm-topbar">
      <button className="crm-icon crm-desktop-toggle" aria-label={rail==='full'?'Свернуть меню':'Развернуть меню'} title={rail==='full'?'Свернуть меню':'Развернуть меню'} aria-expanded={rail==='full'} onClick={()=>setRail(rail==='full'?'mini':'full')}>{rail==='full'?<PanelLeftClose/>:<PanelLeftOpen/>}</button>
      <button className="crm-icon crm-mobile-toggle" aria-label="Открыть меню" aria-haspopup="dialog" onClick={()=>setPanel('nav')}><Menu/></button>
      <Link className="crm-header-brand" to={home} aria-label="партнерская платформа билайн"><img src={logo} alt="" width="28" height="28"/></Link>
      <span className="crm-crumb">{label}<ChevronRight size={14}/><strong>{active[1]}</strong></span>
      <div className="crm-tools"><button className="crm-search-trigger" onClick={openSearch} aria-label="Поиск по кабинету" aria-haspopup="dialog" title={'Поиск по кабинету ('+searchShortcut+')'}><Search size={17}/><span>поиск</span><kbd>{searchShortcut}</kbd></button>
      <button className="crm-guide-trigger" onClick={openGuide} aria-label="С чего начать" aria-haspopup="dialog" title="С чего начать"><BookOpen size={18}/>{guideSeen==='no' && <span>С чего начать</span>}</button>
      <button className="crm-icon crm-theme-toggle" onClick={()=>setTheme(dark?'light':'dark')} aria-label={dark?'Включить светлую тему':'Включить тёмную тему'} title={dark?'Светлая тема':'Тёмная тема'}>{dark?<Sun/>:<Moon/>}</button>
      <button className="crm-icon crm-settings-trigger" onClick={()=>setPanel('settings')} aria-label="Настройки интерфейса" aria-haspopup="dialog" title="Настройки интерфейса"><Settings2/></button>
      <button className="crm-icon crm-bell" onClick={()=>setPanel('events')} aria-label="Последние события" aria-haspopup="dialog" title={unread?'Новых событий · '+unread:'Последние события'}><Bell/>{unread>0&&<b>{unread}</b>}</button>
      <button className="crm-avatar" aria-label="Открыть профиль" aria-haspopup="dialog" title="Профиль" onClick={()=>setPanel('profile')}>{initials}</button></div>
    </header><main id="cabinet-content" className="cab-main crm-main" tabIndex={-1}>{children}</main></div>
    {panel && <CabinetDialog key={panel} close={close} variant={panel==='search'?'command':panel==='nav'?'mobile':'drawer'}
      title={{nav:label,search:'Поиск по кабинету',events:'Последние события',profile:'Профиль',settings:'Настройки интерфейса',guide:'С чего начать'}[panel]}>
      {panel==='nav' && <>{navigation()}<Link className="crm-navlink" to="/market/"><Store size={18}/>витрина предложений</Link>
        <button className="crm-navlink" onClick={()=>setPanel('settings')}><Settings2 size={18}/>Настройки интерфейса</button></>}
      {panel==='guide' && <CabinetGuide staff={staff} close={close}/>}
      {panel==='profile' && <div className="crm-profile"><span className="crm-profile-mark"><UserRound/></span><h3>{profile}</h3><p>{session.email}</p><p>{label}</p>
        {!staff && <Link to="/app/company" className="bl-btn" onClick={close}>данные компании</Link>}{logout}</div>}
      {panel==='settings' && <div className="crm-preferences">{([
        ['Оформление',theme,setTheme,[['light','Светлое'],['dark','Тёмное'],['system','Системное']]],
        ['Плотность таблиц',density,setDensity,[['normal','Обычная'],['compact','Компактная']]],
        ['Навигация',orientation,setOrientation,[['vertical','Боковая'],['horizontal','Верхняя']]],
        ['Сторона бокового меню',side,setSide,[['left','Слева'],['right','Справа']]],
        ['Карточки',surface,setSurface,[['flat','Плоские'],['border','С рамкой'],['shadow','С тенью']]],
        ['Цвета графиков',palette,setPalette,[['classic','Жёлтый и графит'],['contrast','Бирюзовый и фиолетовый']]],
        ['Ширина рабочей области',width,setWidth,[['wide','На весь экран'],['boxed','Ограниченная']]],
      ] as const).map(([title,value,save,options])=><fieldset key={title}><legend>{title}</legend>{options.map(([id,label])=><label key={id}><input type="radio" name={title} checked={value===id} onChange={()=>save(id)}/>{label}{value===id&&<Check size={16}/>}</label>)}</fieldset>)}</div>}
      {panel==='search' && <><form className="crm-command-field" onSubmit={e=>{e.preventDefault();goSearch()}}><Search size={20}/><input data-dialog-focus aria-label="Строка поиска" placeholder="Раздел, компания или кампания" value={search} maxLength={120} onChange={e=>setSearch(e.target.value)}/></form>
        {search.trim() ? <button className="bl-btn bl-btn--s" onClick={()=>setSearch('')}>Очистить поиск</button> : <p className="crm-muted">Выберите раздел или введите название кампании или промокод.</p>}
        <nav aria-label="Результаты поиска">{links.filter(([,text])=>text.toLowerCase().includes(search.trim().toLowerCase())).map(([path,text,Icon])=><Link key={path} className="crm-navlink" to={path} onClick={close}><Icon size={18}/>{text}</Link>)}
        {search.trim() && <button className="crm-navlink" onClick={goSearch}><Search size={18}/>искать «{search.trim()}» в кампаниях</button>}</nav></>}
      {panel==='events' && <><div className="crm-event-tabs" aria-label="Виды событий">
        <button aria-pressed={eventTab==='recent'} onClick={()=>setEventTab('recent')}>Все события</button>
        <button aria-pressed={eventTab==='attention'} onClick={()=>setEventTab('attention')}>Требуют внимания</button></div>
        {!staff && eventTab==='recent' && <CampaignNotifications feed={notices}/>}
        {readError && <p role="alert">{readError}</p>}
        {eventTab==='recent' ? events.isPending?<p role="status">Загружаем события…</p>:events.isError?<p role="alert">Не удалось загрузить события. <button className="bl-btn" onClick={()=>void events.refetch()}>Повторить</button></p>:<>
          {(staff || events.data.recent.length>0 || (notices.isSuccess && !latest?.items.length)) && <CabinetEvents staff={staff} items={events.data.recent} close={close} seen={Number(seen)}/>}
          {(events.data.recent.length>0 || !!latest?.items.length)&&<button className="bl-btn bl-btn--s" disabled={!unread} onClick={()=>void markRead()}><MailOpen size={16}/>{unread?'Отметить прочитанными':'Все события прочитаны'}</button>}</>
        : attention.isPending?<p role="status">Проверяем кампании…</p>:attention.isError?<p role="alert">Не удалось загрузить кампании. <button className="bl-btn" onClick={()=>void attention.refetch()}>Повторить</button></p>:<>
          <p className="crm-muted">{staff?'Кампании на модерации':'Кампании на этапе договора'} · {attention.data.total}</p>
          {attention.data.items.length ? <div className="crm-attention">{attention.data.items.map(r=><Link key={r.id} to={campaignRowPath(r,staff)} onClick={close}>{staff?r.name:r.code||r.name}<ChevronRight size={15}/></Link>)}
          <Link to={home+'?status='+attentionStatus} onClick={close}>Весь список</Link></div>:<p>Сейчас всё обработано.</p>}</>}</>}

    </CabinetDialog>}
  </div>
}
export function CampaignStatus({status}:{status:PartnerCampaignStatus}) {
  return <span className="crm-status" data-status={status}><i/>{campaignLabels[status]}</span>
}
