import { offerAssetRules } from '../../shared/offer-assets'

export function OfferGuidelines() {
  return <details className="offer-guidelines"><summary>Требования к материалам</summary>
    <div><p>Рабочие требования редактора. Форматы размещения согласуем перед запуском.</p>
      <dl>{Object.values(offerAssetRules).map(rule => <div key={rule.label}><dt>{rule.label}</dt><dd>{rule.hint}</dd></div>)}</dl>
      <p>PNG, JPG, WebP или AVIF, до 5 МБ. Файлы с анимацией и SVG не поддерживаются. Используйте материалы, на которые у вас есть права.</p>
      <p>В готовом макете оставьте по 10% свободного пространства от каждого края. Крупно покажите выгоду и бренд. Промокод и срок задайте также в «Условиях»: их увидит клиент при открытии предложения. Не добавляйте кнопку и маркировку «реклама» в изображение, их покажет площадка.</p>
      <a href={import.meta.env.BASE_URL + 'offer-guidelines.html'} target="_blank" rel="noreferrer">Открыть памятку для дизайнера</a>
    </div>
  </details>
}
