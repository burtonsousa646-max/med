import { normalizeBusinessWebsite, offerTheme } from './campaign-business.ts'
import { emptyOffer, type OfferDraft } from './campaign-offer.ts'
import { designs, type Promo } from './mvp-promo.ts'
import type { MarketOffer } from './market.ts'

export function promoOffer(p: Promo): OfferDraft {
  return {...emptyOffer,title:p.cond.trim() || 'Скидка по промокоду',promo:p.code,discount:p.off,until:p.till,
    tone:designs.find(d=>d.file===p.design)?.tone ?? emptyOffer.tone}
}

export function campaignMarketCard(input:{
  id:string; name:string; category:string; website:string; online:boolean; addresses:string[]; offer:OfferDraft;
  partner?:Pick<Promo,'brandName'|'activity'|'design'>; image:string; logo:string; erid:string;
}): MarketOffer {
  const {id,name,category,online,partner,logo,erid}=input
  const {title,promo,discount,until,tone,background,gift,zoom,layout}=input.offer
  const theme=offerTheme(category)
  const design=designs.find(d=>d.file===partner?.design)
  const brand=partner?.brandName?.trim()
  return {id,name,category,group:theme.title?theme.cat:'other',offer:{title,promo,discount,until,tone,background,gift,zoom,layout},
    ...(brand && {catalog:{brand}}), ...(partner?.activity && {description:partner.activity}),
    online,addresses:online?[]:input.addresses.filter(Boolean),website:normalizeBusinessWebsite(input.website),
    image:input.image || (design?'/img/offer-variants/'+design.file:''),logo,erid}
}

export function promoMarketCard(p:Promo,name:string,category='') {
  return campaignMarketCard({id:'',name,category:p.activity || category,website:p.site,online:!!p.online,addresses:p.addresses ?? [],
    offer:promoOffer(p),partner:p,image:p.usePhoto===false?'':p.photo?.src || '',logo:p.logo?.src || '',erid:''})
}
