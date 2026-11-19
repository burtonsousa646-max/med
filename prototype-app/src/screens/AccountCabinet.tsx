import type { ReactNode } from 'react'
import { Brand } from '../ui'
import type { PartnerCampaignStatus } from '../../shared/mvp-promo'
import './v4-staff.css'

export function AccountCabinet({home, label, account, navigation, logout, children}:{
  home:string; label:string; account:ReactNode; navigation:ReactNode; logout:ReactNode; children:ReactNode
}) {
  return <div className="bl-page staff-page ym-hide-content ym-disable-keys"><div className="cab">
    <aside className="cab-nav staff-nav">
      <Brand to={home}/>
      <nav aria-label={label}>{navigation}</nav>
      <div className="staff-account">{account}{logout}</div>
    </aside>
    <main className="cab-main">{children}</main>
  </div></div>
}

export function CampaignStatus({status}:{status:PartnerCampaignStatus}) {
  const active = status === 'published', stopped = status === 'stopped' || status === 'expired'
  return <span className={'bl-tag ' + (active ? 'bl-tag--soft-green' : stopped ? '' : 'bl-tag--soft-violet')}>
    {active ? 'Активна' : stopped ? 'Остановлена' : 'На модерации'}
  </span>
}
