import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { analytics } from '../analytics'
import { Brand } from '../ui'
import CampaignWizard from './CampaignWizard'
import { campaignStages, emptyCampaignDraft, loadCampaignDraft, saveCampaignDraft, type CampaignDraft } from './campaign-draft'
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
  const storageFailed = useRef(false)
  useEffect(() => {
    let active = true
    loadCampaignDraft().then(value => {
      if (active) {
        setDraft(value); setStorage('saved')
        const resumed = value.reached > 0 || Boolean(value.business.inn || value.business.phone)
        analytics.event('v4_draft_restore', { result: resumed ? 'success' : 'empty', resumed, step: campaignStages[value.stage] })
      }
    }).catch(() => {
      if (active) { setDraft(emptyCampaignDraft()); setStorage('error'); storageFailed.current = true; analytics.event('v4_draft_error', { reason: 'storage', result: 'error' }) }
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
    return saveCampaignDraft(value).then(() => {
      if (token === revision.current) { unsaved.current = false; setStorage('saved'); storageFailed.current = false }
      return true
    }).catch(() => {
      if (token === revision.current) {
        setStorage('error')
        if (!storageFailed.current) analytics.event('v4_draft_error', { reason: 'storage', result: 'error' })
        storageFailed.current = true
      }
      return false
    })
  }, [])

  return <div className="v3-v2-theme campaign-page-theme">
    <div className="campaign-page-shell">
      <header className="campaign-page-header" onClickCapture={event => { if (event.target instanceof Element && event.target.closest('a')) analytics.event('v4_flow_exit', { target: 'landing', source: 'header' }) }}><Brand to="/v4"/><Link className="bl-btn" to="/v4"><ArrowLeft size={18}/>к лендингу</Link></header>
      {storage === 'error' && <p className="campaign-page-storage bl-caption" role="status">Не удалось сохранить изменения. Оставьте страницу открытой, чтобы не потерять данные</p>}
      {draft ? <CampaignWizard open onClose={() => navigate('/v4')} presentation="page" initialDraft={draft} onDraftChange={save} storageState={storage}/> : <main className="campaign-page-loading" aria-busy="true" aria-label="Загрузка черновика"><div/><div/><div/></main>}
    </div>
  </div>
}
