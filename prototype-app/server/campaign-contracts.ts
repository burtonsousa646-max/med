import { readFile } from 'node:fs/promises'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { db } from './db.ts'
import { draftKeyPattern } from './campaign-email.ts'
import { buildContractPdf, contractFileLimit, contractTemplate, requiredContractFields, type ContractAttachment, type ContractRecord } from '../shared/campaign-contract.ts'
import { parsePartnerDetails } from '../shared/partner-details.ts'
import { readPartnerRegistry } from './partner-registry.ts'
import { readContractFile } from './contract-file.ts'
import type { MvpSession } from '../shared/mvp-promo.ts'

const fields='id,email,inn,company,details,created_at createdAt,signed_at signedAt,signed_by signedBy,sent_at sentAt,version,attachment_name attachmentName,submission_id submissionId'
export function contractRecord(id:string,owner?:string):ContractRecord|null {
  const row=db.prepare('select '+fields+' from campaign_contracts where id=?'+(owner?' and email=?':'')).get(id,...(owner?[owner]:[]))
  return row?{...row,...(owner&&{signedBy:null}),details:JSON.parse(String(row.details))} as ContractRecord:null
}
export function contractForSubmission(id:string,owner?:string) {
  const row=db.prepare('select id from campaign_contracts where submission_id=?').get(id)
  return row?contractRecord(String(row.id),owner):null
}
function validAttachment(file:ContractAttachment) {
  if (!file || typeof file.name!=='string'||!file.name.trim()||file.name.length>200||/[\x00-\x1f\/\\]/.test(file.name)
    ||typeof file.base64!=='string'||file.base64.length>Math.ceil(contractFileLimit/3)*4||!/^[a-zA-Z0-9+/]+={0,2}$/.test(file.base64)) return false
  const bytes=Buffer.from(file.base64,'base64')
  return bytes.length<=contractFileLimit && (file.type==='application/pdf' && bytes.subarray(0,5).toString()==='%PDF-' ||
    file.type==='image/png' && bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a' || file.type==='image/jpeg' && bytes[0]===255 && bytes[1]===216)
}
export function contractDownload(id:string,owner?:string,inline=false) {
  const record=contractRecord(id,owner)
  const row=record&&db.prepare('select document from campaign_contracts where id=?').get(id)
  if(!row?.document)return new Response(null,{status:404})
  return new Response(new Uint8Array(row.document as Uint8Array),{headers:{
    'Content-Type':'application/pdf','Content-Disposition':(inline?'inline':'attachment')+'; filename="contract-'+id+'-v'+record!.version+'.pdf"',
    'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':inline?"default-src 'none'; frame-ancestors 'self'":"sandbox; default-src 'none'"}})
}
export type ContractSender=(email:string,pdf:Uint8Array,id:string)=>Promise<void>
export function partnerContracts(send:ContractSender) {
  const router=new Hono<{Variables:{session:MvpSession}}>()
  let reading=0
  router.post('/read-file',bodyLimit({maxSize:4_300_000,onError:c=>c.json({message:'Выберите файл до 3 МБ.'},413)}),async c=>{
    const file=await c.req.json().catch(()=>null)
    if(!validAttachment(file))return c.json({message:'Выберите PDF, PNG или JPG до 3 МБ.'},422)
    if(reading>=3)return c.json({message:'Распознавание занято. Попробуйте ещё раз.'},429)
    reading++
    try { return c.json(await readContractFile(file,AbortSignal.any([c.req.raw.signal,AbortSignal.timeout(100_000)]))) }
    catch {return c.json({message:'Не удалось прочитать реквизиты. Введите их вручную.'},422)}
    finally {reading--}
  })
  router.get('/defaults',c=>{
    const profile=c.var.session.profile
    if(!profile)return c.json({})
    const data=readPartnerRegistry(profile.inn,Date.now())
    return c.json({legalName:data?.legalName||profile.company,legalAddress:data?.legalAddress||profile.addr,kpp:data?.kpp,
      ogrn:data?.ogrn,signer:data?.manager,signerRole:data?.managerRole,taxSystem:data?.taxSystem})
  })
  router.get('/:id',c=>c.json(contractRecord(c.req.param('id'),c.var.session.email)))
  router.get('/:id/pdf',c=>contractDownload(c.req.param('id'),c.var.session.email,c.req.query('view')==='inline'))
  router.post('/:id',bodyLimit({maxSize:4_300_000,onError:c=>c.json({message:'Приложите файл до 3 МБ.'},413)}),async c=>{
    const id=c.req.param('id'),{email,profile}=c.var.session
    const body=await c.req.json().catch(()=>null)
    if(!draftKeyPattern.test(id)||!profile||body?.inn!==profile.inn)return c.json({message:'Укажите компанию для договора.'},422)
    const draft=db.prepare("select email,inn,version,json_extract(data,'$.contractInput.confirmedInn') confirmedInn from partner_campaign_drafts where id=?").get(id)
    if(draft && (draft.email!==email || draft.inn && draft.inn!==profile.inn))return c.json({message:'Черновик недоступен.'},404)
    if(draft && draft.version!==body.draftVersion)return c.json({message:'Черновик изменился. Откройте сохранённую версию.'},409)
    const old=contractRecord(id)
    if(!old && draft && draft.confirmedInn!==profile.inn)return c.json({message:'Подтвердите ИНН компании в этом черновике.'},422)
    if(old && (old.email!==email||old.inn!==profile.inn))return c.json({message:'Договор недоступен.'},404)
    if(old?.signedAt || old?.submissionId || body.version!==(old?.version??0))return c.json({message:'Договор изменился. Обновите страницу.'},409)
    const attachment:ContractAttachment|undefined=body.attachment
    let details
    try {details=parsePartnerDetails(body.details,profile.inn)} catch {return c.json({message:'Проверьте формат реквизитов.'},422)}
    if(!details?.legalName || (attachment&&!validAttachment(attachment)))return c.json({message:'Укажите наименование и проверьте файл реквизитов.'},422)
    if(requiredContractFields(profile.inn).some(k=>!details[k]))return c.json({message:'Дополните обязательные реквизиты для договора.'},422)
    const next:ContractRecord={id,email,inn:profile.inn,company:details.legalName,details,createdAt:Date.now(),signedAt:null,signedBy:null,
      version:(old?.version??0)+1,sentAt:null,submissionId:null,attachmentName:attachment?.name??null}
    const [template,font]=await Promise.all([readFile(new URL('../public/docs/'+contractTemplate+'.pdf',import.meta.url)),readFile(new URL('../../design-system/fonts/beelinesans-regular.ttf',import.meta.url))])
    let document
    try {document=await buildContractPdf(template,font,next,attachment)} catch {return c.json({message:'Не удалось сформировать PDF. Проверьте реквизиты и приложение.'},422)}
    if(draft && !db.prepare('select 1 from partner_campaign_drafts where id=? and email=? and inn is ? and version=?').get(id,email,draft.inn,draft.version))
      return c.json({message:'Черновик изменился во время формирования договора. Повторите после проверки.'},409)
    const saved=db.prepare(`insert into campaign_contracts(id,email,inn,company,details,created_at,document,attachment_name,version) values (?,?,?,?,?,?,?,?,?)
      on conflict(id) do update set company=excluded.company,details=excluded.details,created_at=excluded.created_at,document=excluded.document,
      attachment_name=excluded.attachment_name,version=excluded.version,sent_at=null
      where email=excluded.email and inn=excluded.inn and signed_at is null and submission_id is null and version=excluded.version-1`)
      .run(id,email,profile.inn,next.company,JSON.stringify(details),next.createdAt,document,next.attachmentName,next.version)
    return saved.changes?c.json(next):c.json({message:'Договор изменился. Обновите страницу.'},409)
  })
  router.post('/:id/email',c=>emailContract(c,c.req.param('id'),send,c.var.session.email))
  return router
}

export async function emailContract(c:Context,id:string,send:ContractSender,owner?:string) {
    const record=contractRecord(id,owner)
    if(!record)return c.json({message:'Сначала сформируйте договор.'},404)
    const now=Date.now()
    const claim=db.prepare('update campaign_contracts set mailing_at=? where id=? and version=? and coalesce(mailing_at,0)<? and coalesce(sent_at,0)<? returning document')
      .get(now,id,record.version,now-120_000,now-60_000)
    if(!claim)return c.json({message:'Письмо уже отправляется или недавно было отправлено.'},429)
    try {await send(record.email,claim.document as Uint8Array,id)}
    catch {return c.json({message:'Не удалось отправить письмо. Можно повторить отправку или скачать PDF.'},503)}
    finally {db.prepare('update campaign_contracts set mailing_at=null where id=? and mailing_at=?').run(id,now)}
    db.prepare('update campaign_contracts set sent_at=? where id=? and version=?').run(now,id,record.version)
    return c.json({sent:true})
}
