import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { Brand } from '../ui'
import CampaignWizard from './CampaignWizard'
import { emptyCampaignDraft, loadCampaignDraft, saveCampaignDraft, type CampaignDraft } from './campaign-draft'
import './landing-v3.css'
import './landing-motion.css'
import './v3-v2-theme.css'
import './campaign-page.css'

export default function CampaignPage() {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<CampaignDraft | null>(null)
  const [storage, setStorage] = useState<'loading' | 'saving' | 'saved' | 'error'>('loading')
  const revision = useRef(0)
  const unsaved = useRef(false)
  useEffect(() => {
    let active = true
    loadCampaignDraft().then(value => {
      if (active) { setDraft(value); setStorage('saved') }
    }).catch(() => {
      if (active) { setDraft(emptyCampaignDraft()); setStorage('error') }
    })
    return () => { active = false }
  }, [])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (unsaved.current) event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])
  const save = useCallback((value: CampaignDraft) => {
    const token = ++revision.current
    unsaved.current = true
    setStorage('saving')
    void saveCampaignDraft(value).then(() => {
      if (token === revision.current) { unsaved.current = false; setStorage('saved') }
    }).catch(() => { if (token === revision.current) setStorage('error') })
  }, [])

  return <div className="v3-v2-theme campaign-page-theme">
    <div className="campaign-page-shell">
      <header className="campaign-page-header"><Brand to="/v4"/><Link className="bl-btn" to="/v4"><ArrowLeft size={18}/>к лендингу</Link></header>
      <p className="campaign-page-storage bl-caption" role="status">{storage === 'error' ? 'Не удалось сохранить черновик в браузере. Оставьте страницу открытой, чтобы не потерять изменения.' : storage === 'loading' ? 'Открываем ваш черновик…' : storage === 'saving' ? 'Сохраняем черновик…' : 'Черновик сохранён в этом браузере. Его можно продолжить позже.'}</p>
      {draft ? <CampaignWizard open onClose={() => navigate('/v4')} presentation="page" initialDraft={draft} onDraftChange={save}/> : <main className="campaign-page-loading" aria-busy="true" aria-label="Загрузка черновика"><div/><div/><div/></main>}
    </div>
  </div>
}
