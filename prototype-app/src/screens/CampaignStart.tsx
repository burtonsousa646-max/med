import { useRef } from 'react'
import { Globe2, PencilLine, ScanLine, Eye } from 'lucide-react'
import { Field } from './CampaignField'
import { CampaignCreative } from './CampaignCreative'
import { emptyOffer } from '../../shared/campaign-offer'
import { websiteError, textError, type Business } from '../../shared/campaign-business'

export function CampaignStart({ business, bySite, loading, onSource, onChange }: {
  business: Business; bySite: boolean; loading: boolean; onSource: (site: boolean) => void; onChange: (value: Business) => void
}) {
  const fields = useRef<HTMLFieldSetElement>(null)
  function changeSource() {
    onSource(!bySite)
    requestAnimationFrame(() => fields.current?.querySelector('input')?.focus())
  }
  return <div className="v3-business-start">
    <fieldset ref={fields} className="v3-fields campaign-start-source" disabled={loading}>
      {bySite ? <Field key="site" icon={Globe2} label="Адрес сайта" inputMode="url" autoComplete="url" placeholder="example.ru/zavtraki" required maxLength={250}
        value={business.website} error={websiteError(business.website)} onChange={e => onChange({ ...business, website: e.target.value })} hint="Вставьте ссылку на товар или услугу. Возьмём с этой страницы название и описание."/>
        : <Field key="description" icon={PencilLine} hint="Достаточно одной фразы: что вы предлагаете и где работаете." label="Что вы хотите продвигать?" placeholder="Например, кофе и завтраки в Казани" maxLength={100} required
          value={business.category} error={textError(business.category, 'Описание', 3)} onChange={e => onChange({ ...business, category: e.target.value })}/>}
      {loading ? <span className="campaign-reading" role="status"><ScanLine size={16} aria-hidden="true"/>Читаем страницу…</span>
        : <button type="button" className="v3-text-button campaign-source-alternative" onClick={changeSource}>
          {bySite ? <PencilLine size={16} aria-hidden="true"/> : <Globe2 size={16} aria-hidden="true"/>}
          {bySite ? 'У меня нет сайта' : 'Указать сайт'}
        </button>}
    </fieldset>
    <aside className="campaign-draft-preview"><h4><Eye size={17} aria-hidden="true"/>Пример оффера</h4>
      <CampaignCreative name="Зерно" offer={{ ...emptyOffer, title: 'Кофе с собой' }} image={import.meta.env.BASE_URL + 'img/offer-variants/coffee-ivory.png'} illustration="" logo="" disabled/>
    </aside>
  </div>
}
