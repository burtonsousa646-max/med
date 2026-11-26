import type { components } from '../src/api.gen.ts'

export type Review = components['schemas']['SubmissionReview']
export type MarketOffer = components['schemas']['MarketOffer']
export type MarketCardCopy = components['schemas']['MarketCardCopy']
export const reviewLabels = {review:'На проверке', awaiting_payment:'Ожидает оплаты', published:'На витрине', expired:'Срок предложения истёк'}

export const marketOfferPath = (id:string) => '/market/offer/'+encodeURIComponent(id)
