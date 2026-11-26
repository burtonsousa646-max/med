import { contractMailbox, type ContractInput } from '../../shared/partner-campaign-draft'
import { useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { innError } from '../../shared/campaign-business'
import { Link } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, ChevronDown, Download, FileUp, Mail, Paperclip, Pencil, Search } from 'lucide-react'
import { partnerFields, partnerFieldKeys, type PartnerDetails } from '../../shared/partner-details'
import { contractFileLimit, requiredContractFields, type ContractAttachment, type ContractRecord } from '../../shared/campaign-contract'
import { CompanyInnForm, savePartnerCompany, errorMessage, mvpRequest, useMvpSession } from './MvpSession'
import { base as staffBase, staffRequest } from './staff-request'
import { partnerDemo } from './mvp-demo'

const apiBase=(import.meta.env.VITE_API_URL??'/api').replace(/\/$/,'')+'/mvp'
export const contractKey=(email:string,id:string)=>['mvp-contract',email,id]
const day=(value:number)=>new Date(value).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow'})

type DocumentAction='preview'|'download'|'email'
type FileDetails={inn:string;details:PartnerDetails}
function pdfPath(record:ContractRecord,staff=false){return (staff?staffBase:apiBase)+'/contracts/'+record.id+'/pdf'}
function ContractPreview({record,staff=false,onClose}:{record:ContractRecord;staff?:boolean;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null)
  const [url,setUrl]=useState(partnerDemo?'':pdfPath(record,staff)+'?view=inline'),[error,setError]=useState('')
  useEffect(()=>{
    dialog.current?.showModal()
    if(!partnerDemo)return
    let closed=false,blob=''
    void import('./demo-contract').then(m=>m.demoContractUrl(record)).then(value=>{
      if(closed)URL.revokeObjectURL(value);else {blob=value;setUrl(value)}
    }).catch(e=>{if(!closed)setError(errorMessage(e))})
    return ()=>{closed=true;if(blob)URL.revokeObjectURL(blob)}
  },[record.id,record.version])
  return <dialog ref={dialog} className="mvp-pdf-preview" aria-label="Договор для подписи" onClose={onClose}>
    <div><h3>Договор для подписи</h3><button type="button" className="bl-btn bl-btn--s" onClick={()=>dialog.current?.close()}>Закрыть</button></div>
    {url?<iframe title="Договор в формате PDF" src={url}/>:<p role="status">{error||'Открываем PDF…'}</p>}
  </dialog>
}
export function ContractDocument({record,staff=false,onChange}:{record:ContractRecord;staff?:boolean;onChange?:(r:ContractRecord)=>void}) {
  const client=useQueryClient(),[working,setWorking]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
  const [preview,setPreview]=useState(false)
  const path='/contracts/'+record.id
  async function action(which:'email'|'confirm'|'download') {
    if(working)return
    setWorking(true);setMessage('');setError('')
    try {
      if(which==='download'){
        const {downloadDemoContract}=await import('./demo-contract')
        await downloadDemoContract(record)
      } else if(which==='email') {
        if(staff)await staffRequest(path+'/email',{body:{version:record.version}})
        else await mvpRequest(path+'/email',{version:record.version},record.email)
        setMessage('Договор отправлен на '+record.email)
      } else {
        const next=await staffRequest<ContractRecord>(path+'/confirm',{body:{version:record.version}})
        onChange?.(next)
        void client.invalidateQueries({queryKey:['v4-staff']})
        setMessage('Получение подписанного договора подтверждено.')
      }
    }catch(e){setError(errorMessage(e))}finally{setWorking(false)}
  }
  return <div className="bl-stack"><p>{record.signedAt?'Подписанный экземпляр получен · '+day(record.signedAt):'Договор сформирован. Менеджер подтвердит получение подписанного экземпляра.'}</p>
    {!staff&&!record.signedAt&&<p>Скачайте договор, подпишите и отправьте экземпляр на <a href={'mailto:'+contractMailbox+'?subject='+encodeURIComponent('Подписанный договор '+record.id)}>{contractMailbox}</a>. Можно также ответить на письмо с договором.</p>}
    {staff&&!record.signedAt&&record.submissionId&&<p>Материалы уже переданы. Подтверждение подписи переведёт кампанию на модерацию.</p>}
    <dl className="staff-fields"><div><dt>Компания</dt><dd>{record.company}</dd></div><div><dt>ИНН</dt><dd>{record.inn}</dd></div>
      <div><dt>Версия договора</dt><dd>{record.version} · {day(record.createdAt)}</dd></div>
      {record.attachmentName&&<div><dt>Приложение с реквизитами</dt><dd>{record.attachmentName}</dd></div>}
      {staff&&record.signedBy&&<div><dt>Подтвердил получение</dt><dd>{record.signedBy}</dd></div>}</dl>
    {preview&&<ContractPreview record={record} staff={staff} onClose={()=>setPreview(false)}/>}
    <div className="bl-row"><button type="button" className="bl-btn" onClick={()=>setPreview(true)}>Показать договор</button>{partnerDemo?<button type="button" className="bl-btn" disabled={working} onClick={()=>void action('download')}><Download size={16}/>Скачать договор</button>
      :<a className="bl-btn" href={(staff?staffBase:apiBase)+path+'/pdf'} download><Download size={16}/>Скачать договор</a>}
      <button type="button" className="bl-btn" disabled={working||partnerDemo} onClick={()=>void action('email')}><Mail size={16}/>{staff?'Отправить партнёру на почту':'Отправить мне на почту'}</button></div>
    <small>{partnerDemo?'Отправка почты доступна в кабинете с сервером.':'Адрес получателя · '+record.email}</small>
    {staff&&!record.signedAt&&<button type="button" className="bl-btn bl-btn--primary" disabled={working} onClick={()=>void action('confirm')}>Подтвердить получение подписанного договора</button>}
    {message&&<p role="status">{message} {!staff&&message.startsWith('Договор отправлен')&&['http://127.0.0.1:5184','http://localhost:5184'].includes(location.origin)&&<a href={'/api/local-contract-mail/'+record.id} download>Скачать вложение из тестовой почты</a>}</p>}{error&&<p role="alert">{error}</p>}
  </div>
}

function fileError(file:File|null) {
  return file && (file.size>contractFileLimit || !['application/pdf','image/png','image/jpeg'].includes(file.type))?'Выберите PDF, PNG или JPG до 3 МБ.':''
}

function RequisitesFile({file,setFile,onReading,disabled=false,onExtract}:{file?:ContractAttachment;onReading:(busy:boolean)=>void;setFile:(file?:ContractAttachment)=>void;disabled?:boolean;onExtract?:(info:FileDetails)=>void}) {
  const session=useMvpSession()
  const feedbackId=useId()
  const [error,setError]=useState(''),[reading,setReading]=useState(false)
  const [message,setMessage]=useState('')
  async function select(selected:File){
    setMessage('')
    const problem=fileError(selected)
    if(problem){setError(problem);return}
    setError('');setReading(true);onReading(true)
    try {
      const base64=await new Promise<string>((resolve,reject)=>{
        const reader=new FileReader()
        reader.onload=()=>resolve(String(reader.result).split(',')[1])
        reader.onerror=()=>reject(new Error('Не удалось прочитать файл. Выберите его ещё раз.'))
        reader.readAsDataURL(selected)
      })
      const attachment={name:selected.name,type:selected.type as ContractAttachment['type'],base64}
      setFile(attachment)
      if(onExtract){
        if(partnerDemo){setMessage('Файл приложен. В демо введите реквизиты вручную.');return}
        const result=await mvpRequest<FileDetails>('/contracts/read-file',attachment,session.email)
        if(!result.inn&&!Object.keys(result.details).length)setError('Реквизиты не распознаны. Заполните поля вручную.')
        else {onExtract(result);setMessage('Перенесли реквизиты из файла. Проверьте заполненные поля.')}
      }
    }catch(e){setError(errorMessage(e))}finally{setReading(false);onReading(false)}
  }
  return <div className="mvp-requisites-file">
    <label className="bl-btn bl-btn--s mvp-file" title="PDF, PNG или JPG до 3 МБ">
      <Paperclip size={15} aria-hidden="true"/>{file?'Заменить файл':'Приложить файл'}
      <input type="file" accept=".pdf,.png,.jpg,.jpeg" aria-invalid={!!error} aria-describedby={feedbackId} disabled={disabled||reading} onChange={e=>{const selected=e.target.files?.[0];e.target.value='';if(selected)void select(selected)}}/>
    </label>
    {reading&&<span role="status">Читаем файл…</span>}
    {file&&<><span>{file.name}</span><button type="button" className="bl-btn bl-btn--ghost" disabled={disabled||reading} onClick={()=>{setFile(undefined);setError('');setMessage('Файл удалён.')}}>Убрать файл</button></>}
    <span id={feedbackId} role={error?'alert':'status'} className={error?'bl-error':undefined}>{error||message}</span>
  </div>
}
function RequisitesSummary({inn,fields}:{inn:string;fields:PartnerDetails}) {
  const otherKeys=partnerFieldKeys.filter(key=>key!=='legalName'&&key!=='kpp'&&key!=='ogrn'&&fields[key]?.trim())
  return <section className="mvp-requisites-summary" aria-label="Реквизиты компании">
    <h3>{fields.legalName}</h3>
    <dl className="mvp-requisites-ids">
      <div><dt>ИНН</dt><dd>{inn}</dd></div>
      {inn.length===10&&fields.kpp&&<div><dt>КПП</dt><dd>{fields.kpp}</dd></div>}
      {fields.ogrn&&<div><dt>{inn.length===12?'ОГРНИП':'ОГРН'}</dt><dd>{fields.ogrn}</dd></div>}
    </dl>
    {!!otherKeys.length&&<details>
      <summary>Все реквизиты<ChevronDown size={15} aria-hidden="true"/></summary>
      <dl className="mvp-requisites-extra">{otherKeys.map(key=><div key={key}><dt>{partnerFields[key].label}</dt><dd>{fields[key]}</dd></div>)}</dl>
    </details>}
  </section>
}

type DetailKey=keyof PartnerDetails
const manualGroups=[
  {title:'Регистрационные данные',keys:['legalName','kpp','ogrn','legalAddress','taxSystem']},
  {title:'Подписант',keys:['signer','signerRole','signerAuthority']},
  {title:'Банковские реквизиты',keys:['bank','bik','account','correspondentAccount']},
] as const

const taxRegimes=[
  ['ОСНО','Общая система'],['УСН','Упрощённая система'],['АУСН','Автоматизированная УСН'],
  ['ЕСХН','Единый сельскохозяйственный налог'],
]
const entrepreneurRegimes=[['ПСН','Патентная система'],['НПД','Налог на профессиональный доход']]

function TaxSystemField({inn,value,onChange,required}:{inn:string;value:string;onChange:(value:string)=>void;required:boolean}) {
  const options=inn.length===12?[...taxRegimes,...entrepreneurRegimes]:taxRegimes
  const [enterOther,setEnterOther]=useState(false)
  const other=enterOther||!!value&&!options.some(([code])=>code===value)
  return <div className="mvp-tax-system">
    <label className="bl-field"><span className="bl-field__label">{partnerFields.taxSystem.label}</span>
      <select className="bl-select" required={required} value={other?'other':value} onChange={e=>{
        const code=e.target.value
        setEnterOther(code==='other')
        onChange(code==='other'?'':code)
      }}>
        <option value="" disabled>Выберите режим</option>
        {options.map(([code,label])=><option key={code} value={code}>{code} — {label}</option>)}
        <option value="other">Другой вариант</option>
      </select>
    </label>
    {other&&<label className="bl-field"><span className="bl-field__label">Укажите режим или сочетание режимов</span>
      <input className="bl-input" required={required} maxLength={partnerFields.taxSystem.length} value={value}
        ref={el=>{el?.setCustomValidity(value&&!value.trim()?'Укажите режим налогообложения.':'')}} onChange={e=>onChange(e.target.value)}/>
    </label>}
  </div>
}

function ContractField({field,inn,value,required,onChange,autoFocus=false,showOptional=false}:{
  field:DetailKey;inn:string;value:string;required:boolean;onChange:(value:string)=>void;autoFocus?:boolean;showOptional?:boolean
}){
  if(field==='taxSystem')return <TaxSystemField inn={inn} value={value} required={required} onChange={onChange}/>
  const definition=partnerFields[field],numeric='digits' in definition
  const length=field==='ogrn' && inn.length===10?13:definition.length
  return <label className="bl-field">
    <span className="bl-field__label">{definition.label}{showOptional&&!required&&<small> · необязательно</small>}</span>
    <input className="bl-input" required={required} maxLength={length} pattern={numeric?'[0-9]{'+length+'}':undefined}
      autoFocus={autoFocus} inputMode={numeric?'numeric':'text'} value={value} onChange={e=>onChange(e.target.value)}
      ref={el=>{el?.setCustomValidity(
        required&&!value.trim()?'Заполните поле.':el.validity.patternMismatch?'Введите '+length+' цифр.':''
      )}}/>
  </label>
}

function Requisites({id,initial,record,onSave,file,setFile,editing,setEditing,overrides,setDraft,onReading,fileBusy,beforeGenerate,changeInn,openDocument,manualInn,allowAttachment=false}:{
  allowAttachment?:boolean;manualInn?:{value:string;change:(inn:string)=>void};id:string;initial:PartnerDetails;record:ContractRecord|null;onSave:(r:ContractRecord)=>void;file?:ContractAttachment;setFile:(file?:ContractAttachment)=>void;overrides?:PartnerDetails;setDraft:(value:PartnerDetails|undefined)=>void;
  onReading:(busy:boolean)=>void;fileBusy:boolean;beforeGenerate:()=>Promise<number>;editing:boolean;setEditing:(value:boolean)=>void;changeInn?:()=>void;openDocument:(r:ContractRecord,action:DocumentAction)=>Promise<void>
}){
  const session=useMvpSession(), inn=manualInn?.value??record?.inn??session.profile!.inn
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const originalFile=useRef(file)
  const originalFields=useRef(overrides)
  const fields=overrides??initial
  const required=requiredContractFields(inn)
  const visibleKeys=editing?partnerFieldKeys.filter(k=>k!=='kpp'||inn.length===10):required.filter(k=>!initial[k]?.trim())
  function field(key:DetailKey) {
    return <ContractField key={key} field={key} inn={inn} value={fields[key]??''} required={required.includes(key)}
      showOptional={!!manualInn} autoFocus={!manualInn&&key==='legalName'} onChange={value=>setDraft({...fields,[key]:value})}/>
  }
  function startEditing() {
    originalFile.current=file
    originalFields.current=overrides
    setDraft(fields)
    setError('')
    setEditing(true)
  }
  function cancelEditing() {
    setDraft(originalFields.current)
    setFile(originalFile.current)
    setError('')
    setEditing(false)
  }
  return <form className="bl-stack mvp-contract-form" aria-busy={busy} onSubmit={async e=>{
    e.preventDefault();if(busy||fileBusy)return;setBusy(true);onReading(true);setError('')
    try {
      const action=((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement|null)?.value as DocumentAction || 'preview'
      const draftVersion=await beforeGenerate()
      const prepared=await mvpRequest<ContractRecord>('/contracts/'+id,{draftVersion,inn,details:fields,attachment:file,version:record?.version??0},session.email)
      onSave(prepared)
      await openDocument(prepared,action)
    }catch(err){setError(errorMessage(err))}finally{setBusy(false);onReading(false)}
  }}>
    {manualInn ? <>
      <p className="bl-caption">Введите реквизиты так, как они указаны в документах компании. Обязательные поля нужны для формирования договора.</p>
      {manualGroups.map(({title,keys},index)=><fieldset key={title} className="mvp-contract-fields" disabled={busy||fileBusy}>
        <legend>{title}</legend>
        {index===0&&<label className="bl-field"><span className="bl-field__label">ИНН компании или ИП</span>
          <input className="bl-input" inputMode="numeric" required maxLength={12} value={inn}
            ref={el=>{el?.setCustomValidity(innError(inn))}} onChange={e=>manualInn.change(e.target.value.replace(/\D/g,''))}/>
        </label>}
        {keys.filter(k=>k!=='kpp'||inn.length!==12).map(field)}
      </fieldset>)}
      <p className="bl-caption">Почта для договора · {session.email}</p>
      {session.profile && !innError(inn) && session.profile.inn!==inn && <p className="bl-caption">После формирования договора эта компания станет текущей в кабинете.</p>}
    </> : <>
      {editing && !record && <p>ИНН {inn}</p>}
      {!editing&&<RequisitesSummary inn={inn} fields={initial}/>}
      {visibleKeys.length>0&&<fieldset className="mvp-contract-fields" aria-label="Редактирование реквизитов" disabled={busy||fileBusy}>
        <legend>{editing?'Реквизиты компании':'Дополните реквизиты'}</legend>
        {visibleKeys.map(field)}
      </fieldset>}
      <div className="mvp-requisites-actions">
        {!editing&&<button type="button" className="mvp-requisite-link" disabled={busy||fileBusy} onClick={startEditing}><Pencil size={15} aria-hidden="true"/>Изменить реквизиты</button>}
        {allowAttachment&&<RequisitesFile onReading={onReading} file={file} setFile={setFile} disabled={busy}
          onExtract={result=>{
            if(result.inn && result.inn!==inn){setFile(undefined);throw new Error('ИНН в файле отличается от ИНН договора. Проверьте файл.')}
            if(!result.inn)throw new Error('Файл приложен. ИНН не распознан, проверьте реквизиты вручную.')
            const populated=Object.fromEntries(Object.entries(fields).filter(([,value])=>value?.trim()))
            setDraft({...result.details,...populated})
          }}/>}
        {!record&&changeInn&&<button type="button" className="mvp-requisite-link" disabled={busy||fileBusy} onClick={changeInn}><ArrowLeftRight size={15} aria-hidden="true"/>Указать другой ИНН</button>}
      </div>
      {record?.attachmentName&&!file&&<small>Чтобы включить прежнее приложение в новую версию, выберите файл снова.</small>}
    </>}
    {error&&<p role="alert" className="bl-error">{error}</p>}
    <div className="mvp-requisites-actions">
      <button type="submit" value="preview" className="bl-btn bl-btn--primary" disabled={busy||fileBusy}>{busy?'Подготавливаем…':'Показать договор'}</button>
      <button type="submit" value="download" className="bl-btn" disabled={busy||fileBusy}><Download size={16}/>Скачать договор</button>
      <button type="submit" value="email" className="bl-btn" disabled={busy||fileBusy||partnerDemo}><Mail size={16}/>Отправить мне на почту</button>
      {!manualInn&&editing&&<button type="button" className="bl-btn" disabled={busy||fileBusy} onClick={cancelEditing}>Отмена</button>}
    </div>
  </form>
}

const contractMethods=[
  {value:'inn',label:'По ИНН',Icon:Search},
  {value:'file',label:'Из файла',Icon:FileUp},
  {value:'manual',label:'Вручную',Icon:Pencil},
] as const

export function ContractStep({id,record,onSave,input,update,onReading,fileBusy,beforeGenerate}:{onReading:(busy:boolean)=>void;fileBusy:boolean;beforeGenerate:()=>Promise<number>;id:string;record:ContractRecord|null;onSave:(r:ContractRecord)=>void;input:ContractInput;update:(patch:Partial<ContractInput>)=>void}){
  const session=useMvpSession(),{method='inn',editing=false,attachment:file}=input
  const tabsId=useId()
  const [preview,setPreview]=useState<ContractRecord|null>(null),[delivery,setDelivery]=useState<{text:string;error?:boolean}|null>(null)
  async function openDocument(r:ContractRecord,action:DocumentAction){
    setDelivery(null)
    if(action==='preview'){setPreview(r);return}
    if(action==='email'){
      try{await mvpRequest('/contracts/'+id+'/email',{version:r.version},session.email);setDelivery({text:'Договор отправлен на '+r.email})}
      catch(e){setDelivery({text:errorMessage(e),error:true})}
    }else if(partnerDemo){await (await import('./demo-contract')).downloadDemoContract(r)}
    else {const link=document.createElement('a');link.href=pdfPath(r);link.download='';link.click()}
  }
  const setFile=(attachment?:ContractAttachment)=>update({attachment})
  const setEditing=(editing:boolean)=>update({editing})
  const confirmed=!!session.profile && input.confirmedInn===session.profile.inn
  const useRegistry=confirmed && !record && method==='inn'
  const defaults=useQuery({queryKey:['contract-defaults',session.email,id,input.confirmedInn],queryFn:()=>mvpRequest<PartnerDetails>('/contracts/defaults',undefined,session.email),enabled:useRegistry,retry:false})
  // Older manual drafts stored a short name and, after confirmation, the edited requisites.
  const manual=input.manual??(method==='manual'
    ? {inn:input.inn??'',fields:{legalName:input.companyName||(confirmed?session.profile?.company:'')||'',...input.fields}}
    : {inn:'',fields:{}})
  function selectMethod(value:NonNullable<ContractInput['method']>) {
    if(value!==method)update({method:value,editing:false,confirmedInn:undefined,...((method==='manual'||value==='manual')&&{manual})})
  }
  async function prepareManual() {
    const {inn,fields}=manual
    const company=fields.legalName!.trim().slice(0,80),addr=fields.legalAddress!.trim().slice(0,200)
    if(company.length<2)throw new Error('Укажите полное наименование компании или ИП.')
    // Persist the same INN the binding endpoint will verify against the draft version.
    flushSync(()=>update({inn,manual,companyName:company,confirmedInn:undefined,fields:undefined,attachment:undefined,fileFields:undefined}))
    const version=await beforeGenerate()
    await savePartnerCompany(session,{...((session.profile?.inn===inn)&&session.profile),inn,company,addr},{draftId:id,draftVersion:version})
    flushSync(()=>update({confirmedInn:inn}))
    return beforeGenerate()
  }
  const savePrepared=(r:ContractRecord)=>{onSave(r);update({editing:false,fields:undefined,manual:undefined})}
  if(record&&(!editing||record.signedAt||record.submissionId))return <>{preview&&<ContractPreview record={preview} onClose={()=>setPreview(null)}/>}<ContractDocument record={record}/>{delivery&&<p role={delivery.error?'alert':'status'} className={delivery.error?'bl-error':undefined}>{delivery.text}</p>}{!record.signedAt&&!record.submissionId&&<button className="mvp-requisite-link" type="button" onClick={()=>setEditing(true)}><Pencil size={15} aria-hidden="true"/>Изменить реквизиты</button>}</>
  if(!record&&(!confirmed||method==='manual'))return <div className="mvp-contract-entry" data-method={method}>
    <div className="mvp-method-tabs" role="tablist" aria-label="Способ заполнения реквизитов">
      {contractMethods.map(({value,label,Icon},index)=><button key={value} id={tabsId+'-tab-'+value} role="tab" type="button"
        aria-selected={method===value} aria-controls={tabsId+'-panel-'+value} tabIndex={method===value?0:-1} disabled={fileBusy}
        onClick={()=>selectMethod(value)} onKeyDown={e=>{
          let next
          switch(e.key){
            case 'Home': next=0;break
            case 'End': next=contractMethods.length-1;break
            case 'ArrowLeft': next=(index+contractMethods.length-1)%contractMethods.length;break
            case 'ArrowRight': next=(index+1)%contractMethods.length;break
            default:return
          }
          e.preventDefault()
          selectMethod(contractMethods[next].value)
          document.getElementById(tabsId+'-tab-'+contractMethods[next].value)?.focus()
        }}><Icon size={18} aria-hidden="true"/>{label}</button>)}
    </div>
    {contractMethods.map(({value})=><div key={value} role="tabpanel" id={tabsId+'-panel-'+value} aria-labelledby={tabsId+'-tab-'+value} hidden={method!==value}>
      {method===value&&<>
        {method==='file'&&<>
          <RequisitesFile onReading={onReading} disabled={fileBusy} file={file} setFile={attachment=>update({attachment,fileFields:undefined,inn:'',companyName:''})}
            onExtract={info=>update({fileFields:info.details,inn:info.inn,companyName:info.details.legalName?.slice(0,80)??''})}/>
          <p className="bl-caption">Загрузите карточку компании в PDF, PNG или JPG до 3 МБ. Возьмём реквизиты с первых пяти страниц.</p>
        </>}
        {method==='manual'&&<Requisites id={id} record={null} initial={manual.fields}
          manualInn={{value:manual.inn,change:inn=>{
            const fields={...manual.fields}
            if(inn.length===12)delete fields.kpp
            if(inn.length===10 && entrepreneurRegimes.some(([code])=>code===fields.taxSystem))delete fields.taxSystem
            update({manual:{inn,fields}})
          }}}
          setDraft={fields=>update({manual:{...manual,fields:fields??{}}})} beforeGenerate={prepareManual}
          fileBusy={fileBusy} onReading={onReading} openDocument={openDocument} onSave={savePrepared}
          editing={false} setEditing={setEditing} setFile={setFile}/>}
        {(method==='inn'||(method==='file'&&file))&&<CompanyInnForm disabled={fileBusy} onBusy={onReading} session={session} manualEntry={method!=='inn'} draft={input} onDraftChange={values=>update({...values,confirmedInn:undefined,
          ...(input.fileFields && input.inn && input.inn!==values.inn && {fileFields:undefined,attachment:undefined})})}
          contractDraft={{id,flush:beforeGenerate}} onConfirm={(company,fromLookup)=>update({inn:company.inn,confirmedInn:company.inn,fields:undefined,
            ...(method!=='file' && {attachment:undefined,fileFields:undefined}),method:method==='file'?'file':fromLookup?'inn':'manual',editing:false})}/>}
      </>}
    </div>)}
  </div>
  if(useRegistry&&defaults.isLoading)return <p role="status">Загружаем реквизиты…</p>
  const imported=method==='file'?input.fileFields:undefined
  const legalName=imported?.legalName?.slice(0,80)===session.profile?.company?imported?.legalName:session.profile?.company
  const initial=record?.details??(useRegistry?defaults.data:undefined)??{legalAddress:session.profile?.addr,...imported,legalName}
  return <>{record&&<p>Реквизиты из сохранённого договора · версия {record.version} от {day(record.createdAt)} · ИНН {record.inn}.
      {' '}<Link to="/app/campaigns/formats">Создать кампанию для другой компании</Link></p>}
    {useRegistry&&defaults.isError&&<p role="status">Данные реестра недоступны. Вы можете заполнить поля вручную.</p>}
    <Requisites allowAttachment={method==='file'||!!record?.attachmentName||!!file} openDocument={openDocument} onReading={onReading} fileBusy={fileBusy} beforeGenerate={beforeGenerate} key={(record?.inn??input.confirmedInn)+'/'+(record?.version??0)} id={id} editing={editing} setEditing={setEditing} file={file} setFile={setFile} overrides={input.fields} setDraft={fields=>update({fields})} initial={initial} record={record}
      changeInn={()=>update({confirmedInn:undefined,inn:'',companyName:'',fields:undefined,fileFields:undefined,attachment:undefined,editing:false,method:'inn'})}
      onSave={savePrepared}/></>
}
