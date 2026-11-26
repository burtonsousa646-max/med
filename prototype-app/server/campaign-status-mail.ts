import type { SendMailOptions } from 'nodemailer'
import { db } from './db.ts'
import { campaignLabels } from '../shared/cabinet-dashboard.ts'
import type { PartnerCampaignStatus } from '../shared/mvp-promo.ts'
import { platformName } from '../shared/brand.ts'
import { emailHeading, emailLayout, emailLogo, escapeMailText } from './email-layout.ts'

type MailEvent = {event_id:number; submission_id:string; previous:PartnerCampaignStatus; stage:PartnerCampaignStatus;
  recipient:string; title:string; attempts:number}
const claim = db.prepare(`update campaign_stage_events set attempts=attempts+1,next_at=?
  where event_id=(select e.event_id from campaign_stage_events e
    where e.recipient is not null and e.sent_at is null and e.next_at<=? and not exists
      (select 1 from campaign_stage_events prior where prior.submission_id=e.submission_id and prior.sent_at is null and prior.recipient is not null and prior.event_id<e.event_id)
    order by e.next_at,e.event_id limit 1) returning *`)

export async function deliverStatusMail(from:string, send:(mail:SendMailOptions)=>Promise<unknown>, now=Date.now()) {
  const event = claim.get(now+600_000,now) as MailEvent | undefined
  if (!event) return false
  const subject = 'Статус кампании изменился · ' + campaignLabels[event.stage]
  const change = campaignLabels[event.previous]+' → '+campaignLabels[event.stage]
  const text = ['Здравствуйте!', event.title, change, 'Подробности доступны в вашем кабинете.', platformName].join('\n\n')
  try {
    await send({from:{name:platformName,address:from},to:[{address:event.recipient,name:''}],subject,text,
      messageId:`<campaign-status-${event.submission_id}-${event.event_id}@${from.split('@')[1]}>`,
      html:emailLayout(subject,emailHeading('Статус кампании изменился')+'<p>'+escapeMailText(event.title)+'</p><p><strong>'+escapeMailText(change)+'</strong></p><p>Подробности доступны в вашем кабинете.</p>'),
      attachments:[emailLogo]})
  } catch {
    db.prepare('update campaign_stage_events set next_at=? where event_id=? and attempts=?').run(now+Math.min(60,2**Math.min(event.attempts-1,6))*60_000,event.event_id,event.attempts)
    console.warn('Campaign status email deferred')
    return false
  }
  db.prepare('update campaign_stage_events set sent_at=? where event_id=? and attempts=?').run(Date.now(),event.event_id,event.attempts)
  return true
}
