import type { PillTone } from '@/components/StatusPill'
import type {
  OfferLifecycleStatus,
  OrderLifecycleStatus,
  OrderPaymentStatus,
  OrderDisputeStatus,
  SettlementStatus,
} from '@/mock-api/types'

export const OFFER_STATUS_LABEL: Record<OfferLifecycleStatus, string> = {
  draft: 'Черновик',
  in_review: 'На модерации',
  changes_requested: 'Нужны правки',
  rejected: 'Отклонён',
  approved: 'Утверждён',
  scheduled: 'Запланирован',
  published: 'Опубликован',
  paused: 'На паузе',
  expired: 'Истёк',
  archived: 'В архиве',
}

export const OFFER_STATUS_TONE: Record<OfferLifecycleStatus, PillTone> = {
  draft: 'neutral',
  in_review: 'wait',
  changes_requested: 'bad',
  rejected: 'bad',
  approved: 'info',
  scheduled: 'info',
  published: 'good',
  paused: 'wait',
  expired: 'neutral',
  archived: 'neutral',
}

export const ORDER_LIFECYCLE_LABEL: Record<OrderLifecycleStatus, string> = {
  created: 'Создан',
  confirmed: 'Подтверждён',
  fulfilled: 'Исполнен',
  closed: 'Закрыт',
  cancelled: 'Отменён',
}
export const ORDER_LIFECYCLE_TONE: Record<OrderLifecycleStatus, PillTone> = {
  created: 'neutral',
  confirmed: 'info',
  fulfilled: 'good',
  closed: 'good',
  cancelled: 'bad',
}

export const ORDER_PAYMENT_LABEL: Record<OrderPaymentStatus, string> = {
  pending: 'Ожидает оплаты',
  authorised: 'Авторизован',
  captured: 'Оплачен',
  partially_refunded: 'Частичный возврат',
  refunded: 'Возвращён',
  failed: 'Ошибка оплаты',
  voided: 'Аннулирован',
}
export const ORDER_PAYMENT_TONE: Record<OrderPaymentStatus, PillTone> = {
  pending: 'neutral',
  authorised: 'info',
  captured: 'good',
  partially_refunded: 'wait',
  refunded: 'wait',
  failed: 'bad',
  voided: 'bad',
}

export const ORDER_DISPUTE_LABEL: Record<OrderDisputeStatus, string> = {
  none: 'Без спора',
  open: 'Открыт спор',
  resolved: 'Спор решён',
}
export const ORDER_DISPUTE_TONE: Record<OrderDisputeStatus, PillTone> = {
  none: 'neutral',
  open: 'bad',
  resolved: 'good',
}

export const SETTLEMENT_STATUS_LABEL: Record<SettlementStatus, string> = {
  draft: 'Черновик',
  reconciling: 'Сверка',
  discrepancies: 'Расхождения',
  reconciled: 'Сверен',
  awaiting_approval: 'Ожидает согласования',
  approved: 'Согласован',
  payment_pending: 'Выплата в процессе',
  failed: 'Ошибка выплаты',
  paid: 'Выплачен',
}
export const SETTLEMENT_STATUS_TONE: Record<SettlementStatus, PillTone> = {
  draft: 'neutral',
  reconciling: 'wait',
  discrepancies: 'bad',
  reconciled: 'info',
  awaiting_approval: 'wait',
  approved: 'info',
  payment_pending: 'wait',
  failed: 'bad',
  paid: 'good',
}
