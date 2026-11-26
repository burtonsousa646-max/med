import { partnerFields, partnerFieldKeys, type PartnerDetails } from './partner-details.ts'

export type ContractAttachment = { name:string; type:'application/pdf'|'image/png'|'image/jpeg'; base64:string }
export type ContractRecord = {
  id:string; inn:string; email:string; company:string; details:PartnerDetails; createdAt:number; signedAt:number|null;
  signedBy:string|null; sentAt:number|null; version:number; attachmentName:string|null; submissionId:string|null
}
export const contractTemplate='oferta_0.1'
export const contractFileLimit=3*1024*1024
export function requiredContractFields(inn:string):(keyof PartnerDetails)[] {
  return partnerFieldKeys.filter(k=>k!=='signerAuthority' && !(inn.length===12 && (k==='kpp'||k==='signerRole')))
}

export async function buildContractPdf(template:Uint8Array,fontBytes:Uint8Array,record:ContractRecord,attachment?:ContractAttachment) {
  const [{PDFDocument,PageSizes,rgb},fontkit]=await Promise.all([import('pdf-lib'),import('@pdf-lib/fontkit')])
  const doc=await PDFDocument.load(template)
  doc.registerFontkit(fontkit.default)
  const font=await doc.embedFont(fontBytes,{subset:true})
  let page=doc.addPage(PageSizes.A4), y=785
  function space(height:number) {
    if (y-height<55) { page=doc.addPage(PageSizes.A4); y=785 }
  }
  function line(text:string,size=11) {
    space(size+8)
    page.drawText(text,{x:45,y,font,size,color:rgb(.15,.18,.23)})
    y-=size+7
  }
  function wrap(value:string) {
    let current=''
    for (const word of value.split(/\s+/)) {
      if (current && font.widthOfTextAtSize(current+' '+word,11)>500) {line(current);current=''}
      for(const ch of word) {
        if(font.widthOfTextAtSize(current+ch,11)>500){line(current);current=''}
        current+=ch
      }
      current+=' '
    }
    if(current.trim())line(current.trim())
  }
  line('Реквизиты и подпись партнёра',20)
  line('Договор № '+record.id,10)
  line('Версия документа: '+record.version,10)
  line('Дата формирования: '+new Date(record.createdAt).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow'}),10)
  y-=8
  wrap('ИНН: '+record.inn)
  wrap('Почта: '+record.email)
  for(const key of partnerFieldKeys) if(record.details[key])wrap(partnerFields[key].label+': '+record.details[key])
  if(attachment)wrap('Приложены реквизиты: '+attachment.name)
  space(80);y-=16
  line('Подпись партнёра ____________________     Дата ______________')
  if(attachment) {
    const bytes=Uint8Array.from(atob(attachment.base64),ch=>ch.charCodeAt(0))
    if (attachment.type==='application/pdf') {
      const annex=await PDFDocument.load(bytes)
      if (!annex.getPageCount() || annex.getPageCount()>40)throw new Error('Проверьте количество страниц приложения')
      for(const p of await doc.copyPages(annex,annex.getPageIndices()))doc.addPage(p)
    } else {
      const img=attachment.type==='image/png'?await doc.embedPng(bytes):await doc.embedJpg(bytes)
      const sheet=doc.addPage(PageSizes.A4), bounds=img.scaleToFit(sheet.getWidth()-60,sheet.getHeight()-60)
      sheet.drawImage(img,{x:(sheet.getWidth()-bounds.width)/2,y:(sheet.getHeight()-bounds.height)/2,...bounds})
    }
  }
  return doc.save()
}
