import {
  LayoutDashboard,
  Building2,
  ShieldCheck,
  FileText,
  Tags,
  Plug,
  Megaphone,
  ShoppingCart,
  Wallet,
  BarChart3,
  Users,
  LifeBuoy,
  Bell,
  ClipboardCheck,
  BadgeCheck,
  Landmark,
  type LucideIcon,
} from 'lucide-react'
import type { SessionScope } from '@/types/session'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

export interface NavSection {
  title: string
  scope: SessionScope
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Обзор',
    scope: 'partner',
    items: [{ to: '/dashboard', label: 'Обзор', icon: LayoutDashboard }],
  },
  {
    title: 'Организация',
    scope: 'partner',
    items: [
      { to: '/organization', label: 'Организация', icon: Building2 },
      { to: '/verification', label: 'Проверка', icon: ShieldCheck },
      { to: '/documents', label: 'Документы', icon: FileText },
    ],
  },
  {
    title: 'Офферы и интеграция',
    scope: 'partner',
    items: [
      { to: '/offers', label: 'Офферы', icon: Tags },
      { to: '/integration', label: 'Интеграция', icon: Plug },
    ],
  },
  {
    title: 'Коммерция',
    scope: 'partner',
    items: [
      { to: '/orders', label: 'Заказы', icon: ShoppingCart },
      { to: '/settlements', label: 'Расчёты', icon: Wallet },
      { to: '/analytics', label: 'Аналитика', icon: BarChart3 },
    ],
  },
  {
    title: 'Продвижение',
    scope: 'partner',
    items: [{ to: '/promotion', label: 'Продвижение', icon: Megaphone }],
  },
  {
    title: 'Команда и поддержка',
    scope: 'partner',
    items: [
      { to: '/team', label: 'Команда', icon: Users },
      { to: '/support', label: 'Поддержка', icon: LifeBuoy },
      { to: '/notifications', label: 'Уведомления', icon: Bell },
    ],
  },
  {
    title: 'Admin (внутреннее)',
    scope: 'internal',
    items: [
      { to: '/admin', label: 'Очереди', icon: LayoutDashboard },
      { to: '/admin/partners', label: 'Партнёры', icon: BadgeCheck },
      { to: '/admin/offers', label: 'Модерация офферов', icon: ClipboardCheck },
      { to: '/admin/settlements', label: 'Выплаты', icon: Landmark },
    ],
  },
]
