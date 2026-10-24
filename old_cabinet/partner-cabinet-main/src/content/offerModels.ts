/**
 * Модели офферов — «кто кому платит». Четыре самые массовые схемы купонных и партнёрских
 * площадок РФ и мира: купон (Groupon, Biglion), CPA и CPS (партнёрские сети вроде Admitad),
 * подписка с делением выручки (магазины приложений, операторские подписки).
 * От модели зависят поля оффера, расчёт экономики и подходящий уровень интеграции.
 */
// Файл не должен импортировать ничего из приложения: его читает и сервер (база знаний помощника).
import type { IntegrationLevelValue } from './integrationLevels.js'

export type OfferModel = 'voucher' | 'cpa' | 'cps' | 'subscription'
type OfferMechanic = 'coupon' | 'promocode' | 'subscription' | 'service'
type CommissionModel = 'CPA' | 'CPS' | 'RevShare'

export type Party = 'client' | 'platform' | 'partner'

export const PARTY_LABEL: Record<Party, string> = {
  client: 'Клиент',
  platform: 'МЁД',
  partner: 'Вы',
}

export interface MoneyStep {
  from: Party
  to: Party
  label: string
}

export type FitLevel = 'recommended' | 'possible' | 'not_recommended'

export const FIT_LABEL: Record<FitLevel, string> = {
  recommended: 'рекомендуется',
  possible: 'возможно',
  not_recommended: 'не рекомендуется',
}

export interface OfferModelLanding {
  tag: string
  title: string
  text: string
  flow: string
  suits: string
}

export interface OfferModelInfo {
  id: OfferModel
  title: string
  /** Короткая карточка для лендинга. */
  landing: OfferModelLanding
  headline: string
  how: string
  flow: MoneyStep[]
  payTrigger: string
  rateHint: string
  examples: string
  suits: string[]
  mechanics: OfferMechanic[]
  commissions: CommissionModel[]
  priceLabel: string
  regularPriceLabel: string
  integration: { fit: Record<IntegrationLevelValue, FitLevel>; why: string }
}

export const OFFER_MODELS: OfferModelInfo[] = [
  {
    id: 'voucher',
    title: 'Купон',
    landing: {
      tag: 'КУПОН',
      title: 'Клиент платит МЁД, мы делим выручку',
      text: 'Клиент покупает купон в каналах Билайн. После погашения мы выплачиваем вам цену купона за вычетом комиссии.',
      flow: 'Клиент → МЁД → Вы',
      suits: 'Кафе · рестораны · салоны · развлечения',
    },
    headline: 'Клиент платит МЁД, мы делим выручку',
    how: 'Клиент покупает купон в каналах Билайн и платит МЁД. Когда он приходит к вам и погашает купон, мы выплачиваем вам цену купона за вычетом комиссии.',
    flow: [
      { from: 'client', to: 'platform', label: 'платит цену купона' },
      { from: 'platform', to: 'partner', label: 'цена купона минус комиссия' },
    ],
    payTrigger: 'Выплата — за погашенные купоны, по итогам расчётного периода (месяц).',
    rateHint:
      'Комиссия — доля от цены купона. Ориентир рынка — десятки процентов цены: у Groupon, например, деление 50/50 с погашенных купонов. Точная ставка фиксируется политикой оффера.',
    examples: 'Groupon, Biglion, КупиКупон',
    suits: [
      'Кафе, рестораны, салоны, развлечения',
      'Услуги с визитом и разовой акцией',
      'Скидка на пакет услуг или абонемент',
    ],
    mechanics: ['coupon', 'service'],
    commissions: ['CPS', 'RevShare'],
    priceLabel: 'Цена купона для клиента, ₽',
    regularPriceLabel: 'Обычная цена, ₽ (для зачёркнутой цены)',
    integration: {
      fit: { L0: 'recommended', L1: 'recommended', L2: 'possible', L3: 'possible' },
      why: 'Купон нужно подтверждать при погашении. Для небольшого потока хватает ручного подтверждения в кабинете (L0), для онлайна — уведомления о погашении (L1).',
    },
  },
  {
    id: 'cpa',
    title: 'CPA',
    landing: {
      tag: 'CPA',
      title: 'Вы платите МЁД за действие клиента',
      text: 'Фиксированная сумма за подтверждённую заявку, регистрацию, установку приложения или первую покупку.',
      flow: 'Клиент → Вы · Вы → МЁД',
      suits: 'Банки · страхование · приложения · онлайн-школы',
    },
    headline: 'Вы платите МЁД за действие клиента',
    how: 'Мы показываем оффер клиентам и ведём их к вам. Вы платите МЁД фиксированную сумму за каждое подтверждённое целевое действие: заявку, регистрацию, установку приложения или первую покупку. Сама сделка идёт напрямую между вами и клиентом.',
    flow: [
      { from: 'client', to: 'partner', label: 'совершает действие у вас' },
      { from: 'partner', to: 'platform', label: 'фикс за подтверждённое действие' },
    ],
    payTrigger: 'Оплата — за каждое подтверждённое действие. Подтверждение вы передаёте сами (postback или файл).',
    rateHint:
      'Ставка — фиксированная сумма за действие. Зависит от ценности клиента: заявка на финансовый продукт стоит дороже установки приложения.',
    examples: 'Admitad и другие CPA-сети; банки и сервисы, платящие за заявку или установку',
    suits: [
      'Банки и страхование (заявка)',
      'Мобильные приложения (установка)',
      'Сервисы с регистрацией и пробным периодом',
      'Онлайн-школы (заявка на курс)',
    ],
    mechanics: ['service', 'promocode'],
    commissions: ['CPA'],
    priceLabel: 'Стоимость для клиента, ₽ (0 — бесплатно)',
    regularPriceLabel: 'Обычная стоимость, ₽',
    integration: {
      fit: { L0: 'not_recommended', L1: 'recommended', L2: 'possible', L3: 'possible' },
      why: 'Платите вы, поэтому МЁД должен получать подтверждение каждого действия. Вручную это неудобно: нужен postback или файл статусов (L1 и выше).',
    },
  },
  {
    id: 'cps',
    title: 'Процент с продаж (CPS)',
    landing: {
      tag: 'ПРОЦЕНТ С ПРОДАЖ',
      title: 'Комиссия только с оплаченной покупки',
      text: 'Клиент покупает у вас. Вы перечисляете МЁД согласованный процент только после подтверждённой оплаты.',
      flow: 'Клиент → Вы → МЁД',
      suits: 'Интернет-магазины · доставка · билеты',
    },
    headline: 'Вы платите МЁД процент с покупки',
    how: 'Клиент переходит от нас на ваш сайт или в приложение и платит вам напрямую. С каждой оплаченной покупки вы платите МЁД процент. Если покупка возвращена, комиссия пересчитывается.',
    flow: [
      { from: 'client', to: 'partner', label: 'оплачивает покупку у вас' },
      { from: 'partner', to: 'platform', label: '% от оплаченной суммы' },
    ],
    payTrigger: 'Оплата — после подтверждения оплаченной покупки и окончания срока возврата.',
    rateHint:
      'Ставка — процент от суммы покупки, обычно зависит от маржинальности категории. Для сравнения: партнёрка Biglion платит вебмастерам 6,5–8,5% в зависимости от категории.',
    examples: 'Партнёрские программы интернет-магазинов и сервисов (Admitad и др.)',
    suits: [
      'Интернет-магазины',
      'Доставка еды и товаров',
      'Билеты, путешествия, бронирование',
      'Сети с кассой и онлайн-заказами',
    ],
    mechanics: ['promocode', 'coupon'],
    commissions: ['CPS'],
    priceLabel: 'Цена на вашем сайте, ₽',
    regularPriceLabel: 'Цена без скидки, ₽',
    integration: {
      fit: { L0: 'not_recommended', L1: 'recommended', L2: 'recommended', L3: 'possible' },
      why: 'Нужны сумма оплаченной покупки и статус возврата. Их передают postback (L1) или коннектор к кассе и CRM (L2).',
    },
  },
  {
    id: 'subscription',
    title: 'Подписка',
    landing: {
      tag: 'ПОДПИСКА',
      title: 'Клиент платит регулярно, мы делимся доходом',
      text: 'За каждый оплаченный период мы выплачиваем вам долю платежа, пока подписка активна.',
      flow: 'Клиент → МЁД → Вы',
      suits: 'Онлайн-кинотеатры · музыка · облачные сервисы',
    },
    headline: 'Клиент платит регулярно, мы делим платежи',
    how: 'Клиент оформляет подписку на ваш сервис и платит МЁД (например, с баланса). За каждый оплаченный период мы выплачиваем вам долю платежа. Возможен пробный период: первые дни бесплатно, затем платная подписка. Вариант: клиент платит вам напрямую, а вы отдаёте МЁД процент от каждого платежа.',
    flow: [
      { from: 'client', to: 'platform', label: 'платит за период подписки' },
      { from: 'platform', to: 'partner', label: 'ваша доля каждый период' },
    ],
    payTrigger: 'Выплата — за каждый оплаченный период, пока подписка активна. Отмена подписки останавливает начисления.',
    rateHint:
      'Доля платформы — процент от платежа. Ориентиры: магазины приложений берут 15–30%, у операторов и агрегаторов в РФ — порядка 30–40% по оценкам рынка.',
    examples: 'Онлайн-кинотеатры, музыка, книги, облачные хранилища, образовательные подписки',
    suits: [
      'Онлайн-кинотеатры и музыкальные сервисы',
      'Облачные и цифровые сервисы',
      'Образовательные и медиа-подписки',
      'Подписка с пробным периодом',
    ],
    mechanics: ['subscription'],
    commissions: ['RevShare'],
    priceLabel: 'Цена подписки, ₽ в месяц',
    regularPriceLabel: 'Цена без акции, ₽ в месяц',
    integration: {
      fit: { L0: 'not_recommended', L1: 'possible', L2: 'possible', L3: 'recommended' },
      why: 'Подписка живёт месяцами: нужно включать и отключать доступ и получать события продления и отмены. Полноценно это даёт API (L3); файл статусов раз в сутки (L1) подходит небольшим сервисам.',
    },
  },
]

export const DEFAULT_OFFER_MODEL: OfferModel = 'voucher'

export function getOfferModel(id: OfferModel): OfferModelInfo {
  return OFFER_MODELS.find((m) => m.id === id) ?? OFFER_MODELS[0]
}

/** Модель для версий, созданных до введения моделей — по паре «механика + комиссия». */
export function deriveOfferModel(mechanic: OfferMechanic, commission: CommissionModel): OfferModel {
  if (mechanic === 'subscription') return 'subscription'
  if (commission === 'CPA') return 'cpa'
  if (commission === 'CPS' && mechanic === 'promocode') return 'cps'
  return 'voucher'
}

/** Механика и комиссия для выбранной модели; уже совместимые значения сохраняются. */
export function normalizeForModel(
  model: OfferModel,
  mechanic: OfferMechanic,
  commission: CommissionModel,
): { mechanic: OfferMechanic; commissionModel: CommissionModel } {
  const info = getOfferModel(model)
  return {
    mechanic: info.mechanics.includes(mechanic) ? mechanic : info.mechanics[0],
    commissionModel: info.commissions.includes(commission) ? commission : info.commissions[0],
  }
}

export function fitOf(model: OfferModel, level: IntegrationLevelValue): FitLevel {
  return getOfferModel(model).integration.fit[level]
}

/** Какие модели подходят уровню интеграции — для карточек выбора уровня. */
export function modelsForLevel(level: IntegrationLevelValue): Array<{ model: OfferModelInfo; fit: FitLevel }> {
  return OFFER_MODELS.map((model) => ({ model, fit: model.integration.fit[level] }))
}

export function recommendedLevels(model: OfferModel): IntegrationLevelValue[] {
  const fit = getOfferModel(model).integration.fit
  return (['L0', 'L1', 'L2', 'L3'] as const).filter((l) => fit[l] === 'recommended')
}
