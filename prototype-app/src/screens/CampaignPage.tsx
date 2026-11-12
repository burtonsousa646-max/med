import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { analytics } from '../analytics'
import { sendCampaignDraft } from '../api'
import { Brand } from '../ui'
import CampaignWizard from './CampaignWizard'
import { campaignDraftForServer, campaignStages, emptyCampaignDraft, loadCampaignDraft, saveCampaignDraft, type StoredCampaignDraft } from './campaign-draft'
import './landing-v3.css'
import './landing-motion.css'
import './v3-v2-theme.css'
import './campaign-page.css'

export default function CampaignPage() {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<StoredCampaignDraft | null>(null)
  const [storage, setStorage] = useState<'loading' | 'saving' | 'saved' | 'error'>('loading')
  const [serverError, setServerError] = useState(false)
  const syncId = useRef('')
  const revision = useRef(0)
  const unsaved = useRef(false)
  const storageFailed = useRef(false)
  const pending = useRef<{ draft: StoredCampaignDraft; revision: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const request = useRef<AbortController | null>(null)

  useEffect(() => {
    let active = true
    loadCampaignDraft().then(value => {
      if (active) {
        syncId.current = value.syncId ?? ''
        setDraft(value); setStorage('saved')
        const resumed = value.reached > 0 || Boolean(value.business.inn || value.business.phone)
        analytics.event('v4_draft_restore', { result: resumed ? 'success' : 'empty', resumed, step: campaignStages[value.stage] })
      }
    }).catch(() => {
      if (active) { setDraft(emptyCampaignDraft()); setStorage('error'); storageFailed.current = true; analytics.event('v4_draft_error', { reason: 'storage', result: 'error' }) }
    })
    return () => { active = false }
  }, [])

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    const next = pending.current
    if (!next) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    void sendCampaignDraft('put', syncId.current, next.revision, campaignDraftForServer(next.draft), controller.signal).then(() => {
      if (pending.current === next && !controller.signal.aborted) { pending.current = null; setServerError(false) }
    }).catch(() => {
      if (pending.current === next && !controller.signal.aborted) setServerError(true)
    })
  }, [])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (unsaved.current) event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    window.addEventListener('online', flush)
    return () => {
      window.removeEventListener('beforeunload', warn)
      window.removeEventListener('online', flush)
      flush()
    }
  }, [flush])

  const saveLocal = useCallback(async (value: StoredCampaignDraft) => {
    const token = revision.current = Math.max(Date.now(), revision.current + 1)
    unsaved.current = true
    setStorage('saving')
    try {
      await saveCampaignDraft({ ...value, syncId: syncId.current || undefined })
      if (token === revision.current) { unsaved.current = false; setStorage('saved'); storageFailed.current = false }
      return token
    } catch (error) {
      if (token === revision.current) {
        setStorage('error')
        if (!storageFailed.current) analytics.event('v4_draft_error', { reason: 'storage', result: 'error' })
        storageFailed.current = true
      }
      throw error
    }
  }, [])

  const save = useCallback((value: StoredCampaignDraft) => {
    if (value.offerAccepted) syncId.current ||= crypto.randomUUID()
    void saveLocal(value).catch(() => {})
    clearTimeout(timer.current)
    if (value.submitted || !value.offerAccepted) {
      pending.current = null
      request.current?.abort()
      setServerError(false)
      return
    }
    pending.current = { draft: value, revision: revision.current }
    timer.current = setTimeout(flush, 650)
  }, [flush, saveLocal])

  const submit = useCallback(async (value: StoredCampaignDraft) => {
    syncId.current ||= crypto.randomUUID()
    clearTimeout(timer.current)
    request.current?.abort()
    try {
      const token = await saveLocal(value)
      if (token === revision.current) pending.current = { draft: value, revision: token }
      await sendCampaignDraft('post', syncId.current, token, campaignDraftForServer(value))
      if (pending.current?.revision === token) pending.current = null
      setServerError(false)
    } catch (error) {
      flush()
      throw error
    }
  }, [flush, saveLocal])

  return <div className="v3-v2-theme campaign-page-theme">
    <div className="campaign-page-shell">
      <header className="campaign-page-header" onClickCapture={event => { if (event.target instanceof Element && event.target.closest('a')) analytics.event('v4_flow_exit', { target: 'landing', source: 'header' }) }}><Brand/><Link className="bl-btn" to="/"><ArrowLeft size={18}/>к лендингу</Link></header>
      {storage === 'error' && <p className="campaign-page-storage bl-caption" role="status">Не удалось сохранить черновик в браузере. Оставьте страницу открытой, чтобы не потерять данные</p>}
      {serverError && <p className="campaign-page-storage bl-caption" role="status">Черновик пока не сохранился на сервере. <button type="button" className="v3-text-button" onClick={flush}>Повторить сохранение</button></p>}
      {draft ? <CampaignWizard open onClose={() => navigate('/')} presentation="page" initialDraft={draft} onDraftChange={save} onSubmitDraft={submit} storageState={storage}/> : <main className="campaign-page-loading" aria-busy="true" aria-label="Загрузка черновика"><div/><div/><div/></main>}
    </div>
  </div>
}
