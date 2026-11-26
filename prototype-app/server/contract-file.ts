import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { innError } from '../shared/campaign-business.ts'
import { partnerFields, type PartnerDetails } from '../shared/partner-details.ts'
import type { ContractAttachment } from '../shared/campaign-contract.ts'

const run=promisify(execFile)
const labels:Record<keyof PartnerDetails|'inn',string>={
  inn:'ИНН(?: организации| компании| получателя)?',kpp:'КПП',ogrn:'ОГРНИП|ОГРН',
  legalName:'полное (?:фирменное )?наименование(?: организации| компании)?|наименование (?:организации|компании|юридического лица)',
  legalAddress:'юридический адрес|адрес регистрации|место нахождения',
  signer:'ФИО (?:подписанта|руководителя)|руководитель|генеральный директор|директор',
  signerRole:'должность (?:подписанта|руководителя)',signerAuthority:'основание полномочий|действует на основании',
  bank:'наименование банка|название банка|банк(?: получателя)?',bik:'БИК(?: банка)?',
  account:'расч[её]тный сч[её]т|р\\s*[/.]\\s*с',correspondentAccount:'корреспондентский сч[её]т|корр\\.? сч[её]т|к\\s*[/.]\\s*с',
  taxSystem:'система налогообложения|налоговый режим|налогообложение',
}
export function extractRequisites(text:string) {
  const details:PartnerDetails={}
  let inn=''
  const lines=text.replace(/\u00a0/g,' ').split(/\r?\n/).map(line=>line.trim()).filter(Boolean)
  const normalized=lines.join('\n')
  for(const [key,label] of Object.entries(labels) as [keyof typeof labels,string][]){
    const numeric=key==='inn'||'digits' in partnerFields[key]
    const length=key==='inn'?'10,12':key==='ogrn'?'13,15':key==='kpp'||key==='bik'?'9':'20'
    const value=numeric?'([0-9]{'+length+'})(?![0-9])':'([^\n]{2,500})'
    const boundary=numeric?'(?:^|[\\s|;,])':'^'
    const pattern=new RegExp(boundary+'(?:'+label+')(?![а-яёa-z])[ \\t]*[:№–—-]?[ \\t]*(?:\\n[ \\t]*)?'+value,'gimu')
    const values=[...new Set([...normalized.matchAll(pattern)].map(m=>m[1].trim()))]
    if(key==='inn'&&values.length>1)return {inn:'',details:{}}
    if(values.length!==1)continue
    const v=values[0]
    if(key==='inn'){if(!innError(v))inn=v}
    else if((numeric || !new RegExp('^(?:'+Object.values(labels).join('|')+')\\s*[:№]','iu').test(v)) && (key!=='ogrn'||v.length===13||v.length===15))
      details[key]=v.slice(0,partnerFields[key].length)
  }
  if(!details.legalName){
    const names=lines.filter(line=>/^(?:ООО|ПАО|АО|ИП|Общество с ограниченной ответственностью)\s+\S/iu.test(line))
    if(names.length===1)details.legalName=names[0].slice(0,500)
  }
  return {inn,details}
}
export async function readContractFile(file:ContractAttachment,signal:AbortSignal) {
  const dir=await mkdtemp(join(tmpdir(),'partner-requisites-'))
  const pdf=file.type==='application/pdf'
  const path=join(dir,pdf?'card.pdf':file.type==='image/png'?'card.png':'card.jpg')
  const options={timeout:25_000,signal,maxBuffer:1024*1024}
  try {
    await writeFile(path,Buffer.from(file.base64,'base64'),{mode:0o600})
    let text=''
    if(process.platform==='darwin'){
      const script=fileURLToPath(new URL('./contract-file.swift',import.meta.url))
      const moduleCache=join(tmpdir(),'beepartners-swift-modules')
      text=(await run('/usr/bin/swift',['-module-cache-path',moduleCache,script,path],{...options,timeout:90_000})).stdout
    }else{
      const recognize=async(image:string)=>(await run('tesseract',[image,'stdout','-l','rus+eng'],options)).stdout
      if(pdf){
        const pages=(await run('pdftotext',['-layout','-f','1','-l','5',path,'-'],options)).stdout.split('\f')
        if(pages.at(-1)==='')pages.pop()
        for(const [index,page] of pages.slice(0,5).entries()){
          if(/[А-Яа-яЁё]{2}/u.test(page))text+='\n'+page
          else {
            const number=String(index+1), output=join(dir,'page-'+number)
            await run('pdftoppm',['-f',number,'-l',number,'-singlefile','-scale-to','1800','-png',path,output],options)
            text+='\n'+await recognize(output+'.png')
          }
        }
      } else text=await recognize(path)
    }
    return extractRequisites(text)
  }finally{await rm(dir,{recursive:true,force:true})}
}
