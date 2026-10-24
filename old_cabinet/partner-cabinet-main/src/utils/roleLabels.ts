import type { Role } from '@/types/session'

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Владелец',
  offer_editor: 'Редактор офферов',
  orders_ops: 'Заказы',
  finance: 'Финансы партнёра',
  developer: 'Разработчик',
  viewer: 'Наблюдатель',
  kam: 'КАМ',
  moderator: 'Модератор',
  finance_internal: 'Финансы Билайна',
  compliance: 'Комплаенс',
}
