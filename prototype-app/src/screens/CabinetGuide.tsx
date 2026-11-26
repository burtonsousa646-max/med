import { Link } from 'react-router'
import { ArrowUpRight, ChartColumn, ClipboardList, FileSearch, Megaphone, Store } from 'lucide-react'

export function CabinetGuide({ staff, close }: { staff: boolean; close: () => void }) {
  const tasks = staff ? [
    { title: 'Проверить кампанию', description: 'Откройте кампанию на модерации. В карточке есть условия предложения и контакты партнёра.', to: '/app/staff?view=list&status=review', Icon: FileSearch },
    { title: 'Проверить договор', description: 'На этапе договора собраны кампании, для которых нужно проверить документы.', to: '/app/staff?view=list&status=contract', Icon: ClipboardList },
    { title: 'Посмотреть реестр витрины', description: 'Найдите оффер и проверьте, что увидит клиент на витрине.', to: '/app/staff?catalog=1', Icon: Store },
  ] : [
    { title: 'Подготовить предложение', description: 'Выберите формат, укажите условия и аудиторию. К черновику можно вернуться из раздела кампаний.', to: '/app/campaigns/formats', Icon: Megaphone },
    { title: 'Проверить статус кампании', description: 'В списке кампаний видно, где нужно ваше действие и какие предложения уже опубликованы.', to: '/app/campaigns', Icon: ClipboardList },
    { title: 'Посмотреть отклик', description: 'После публикации в статистике появятся показы и действия клиентов.', to: '/app/statistics', Icon: ChartColumn },
  ]
  return <ul className="crm-guide">{tasks.map(({ title, description, to, Icon }) =>
    <li key={to}><Link to={to} onClick={close}>
      <span className="crm-guide-icon"><Icon size={20} aria-hidden="true"/></span>
      <span><strong>{title}</strong><small>{description}</small></span>
      <ArrowUpRight size={16} aria-hidden="true"/>
    </Link></li>)}</ul>
}
