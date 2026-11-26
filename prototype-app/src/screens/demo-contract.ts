import { contractFileLimit,requiredContractFields,type ContractAttachment,type ContractRecord } from '../../shared/campaign-contract'
import { parsePartnerDetails } from '../../shared/partner-details'
import type { Profile } from '../../shared/mvp-promo'
import fontUrl from '../../../design-system/fonts/beelinesans-regular.ttf?url'

const prefix='beepartners-partner-demo-v1/contract/'
export function demoContract(id:string):ContractRecord|null {return JSON.parse(localStorage.getItem(prefix+id)??'null')}
export function storeDemoContract(record:ContractRecord){localStorage.setItem(prefix+record.id,JSON.stringify(record))}
export function demoContracts(){return Object.keys(localStorage).filter(k=>k.startsWith(prefix)&&!k.endsWith('-annex-data')).map(k=>demoContract(k.slice(prefix.length))!)}
export function prepareDemoContract(id:string,email:string,profile:Profile,input:Record<string,unknown>) {
  const old=demoContract(id),details=parsePartnerDetails(input.details,profile.inn)
  if(!details?.legalName||input.inn!==profile.inn||old?.signedAt||old?.submissionId||(old?.version??0)!==input.version)throw new Error('Проверьте реквизиты и версию договора.')
  if(requiredContractFields(profile.inn).some(k=>!details[k]))throw new Error('Дополните обязательные реквизиты для договора.')
  const attachment=input.attachment as ContractAttachment|undefined
  if(attachment&&attachment.base64.length>Math.ceil(contractFileLimit/3)*4)throw new Error('Приложите файл до 3 МБ.')
  const record:ContractRecord={id,email,company:details.legalName,inn:profile.inn,createdAt:Date.now(),details,attachmentName:attachment?.name??null,
    version:(old?.version??0)+1,sentAt:null,signedAt:null,signedBy:null,submissionId:null}
  if(attachment)localStorage.setItem(prefix+id+'-annex-data',JSON.stringify(attachment))
  else localStorage.removeItem(prefix+id+'-annex-data')
  storeDemoContract(record);return record
}
export async function demoContractUrl(record:ContractRecord) {
  const {buildContractPdf,contractTemplate}=await import('../../shared/campaign-contract')
  const [template,font]=await Promise.all([import.meta.env.BASE_URL+'docs/'+contractTemplate+'.pdf',fontUrl].map(async url=>new Uint8Array(await (await fetch(url)).arrayBuffer())))
  const attachment=JSON.parse(localStorage.getItem(prefix+record.id+'-annex-data')??'null') as ContractAttachment|null
  const pdf=await buildContractPdf(template,font,record,attachment??undefined)
  return URL.createObjectURL(new Blob([new Uint8Array(pdf)],{type:'application/pdf'}))
}
export async function downloadDemoContract(record:ContractRecord) {
  const link=document.createElement('a'),url=await demoContractUrl(record)
  link.href=url;link.download='Договор-'+record.id+'.pdf';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
