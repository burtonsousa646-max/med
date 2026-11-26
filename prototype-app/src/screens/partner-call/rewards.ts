import bakery from './art/bakery.webp'
import bowling from './art/bowling.webp'
import cinema from './art/cinema.webp'
import flowers from './art/flowers.webp'
import gelato from './art/gelato.webp'

export const rewards = [
  { id: 'bakery', image: bakery, label: 'Круассан', ticket: 'Подарок', color: '#ffcf55', angle: -5,
    partner: 'Пекарня «Утро»', title: 'Круассан к вашему кофе', condition: 'В подарок при заказе любого кофе.',
    terms: 'Выберите кофе любого размера и классический сливочный круассан. Один круассан на один заказ.' },
  { id: 'bowling', image: bowling, label: 'Боулинг', ticket: '−30%', color: '#ccb8f1', angle: 4,
    partner: 'Боулинг «Страйк»', title: 'Дорожка со скидкой 30%', condition: 'На первый час игры в будни до 17:00.',
    terms: 'Скидка действует на аренду одной дорожки с понедельника по пятницу. Прокат обуви оплачивается отдельно.' },
  { id: 'gelato', image: gelato, label: 'Джелато', ticket: '+1 шарик', color: '#b6e4c5', angle: -4,
    partner: 'Джелатерия «Лето»', title: 'Ещё один шарик в рожок', condition: 'При заказе двух шариков джелато.',
    terms: 'Выберите два шарика и добавьте третий из доступных вкусов. Предложение действует на один рожок или стаканчик.' },
  { id: 'flowers', image: flowers, label: 'Цветы', ticket: '−20%', color: '#f7b7c9', angle: 3,
    partner: 'Цветочная «Лепесток»', title: 'Букет со скидкой 20%', condition: 'На готовые букеты в цветочной мастерской.',
    terms: 'Выберите букет из готовой витрины. Предложение действует при самовывозе и не распространяется на доставку.' },
  { id: 'cinema', image: cinema, label: 'Кино', ticket: '1 + 1', color: '#9dcff5', angle: -4,
    partner: 'Кинотеатр «Луч»', title: 'Два билета по цене одного', condition: 'На дневные сеансы по будням.',
    terms: 'Выберите два стандартных места на один сеанс до 17:00 с понедельника по пятницу. Второй билет той же категории — в подарок.' },
]
