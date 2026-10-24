const fs = require('node:fs')
const path = require('node:path')

// [folder, componentName, title, description]
const pages = [
  ['assistant', 'AssistantPage', 'AI-помощник', 'Демонстрационный помощник отвечает по подготовленному FAQ, без подключения к генеративной модели.'],
  ['onboarding', 'RegistrationPage', 'Регистрация', 'Шаг 1 из 6: контактные данные и согласие на обработку.'],
  ['onboarding', 'OrganizationPage', 'Организация', 'Шаг 2 из 6: реквизиты юридического лица.'],
  ['onboarding', 'VerificationPage', 'Проверка', 'Шаг 3 из 6: статус проверки, партнёр не утверждает риск сам.'],
  ['onboarding', 'AgreementPage', 'Оферта', 'Шаг 4 из 6: чтение и акцепт актуальной версии оферты.'],
  ['onboarding', 'IntegrationPage', 'Интеграция', 'Шаг 5 из 6: опросник для выбора уровня интеграции L0–L3.'],
  ['onboarding', 'FirstOfferPage', 'Первый оффер', 'Шаг 6 из 6: создание черновика первого оффера.'],
  ['dashboard', 'DashboardPage', 'Обзор', 'KPI, прогресс онбординга, ближайшие задачи и события.'],
  ['organization', 'OrganizationPage', 'Организация', 'Профиль организации, реквизиты, подписант.'],
  ['organization', 'OutletsPage', 'Точки', 'Точки исполнения/продаж партнёра.'],
  ['verification', 'VerificationPage', 'Проверка', 'Чек-лист проверки, уровень риска, история решений.'],
  ['documents', 'DocumentsPage', 'Документы', 'Версии документов и свидетельства акцепта.'],
  ['offers', 'OfferCatalogPage', 'Офферы', 'Каталог офферов партнёра: поиск, фильтры, статусы.'],
  ['offers', 'OfferConstructorPage', 'Новый оффер', 'Конструктор оффера: условия, лимиты, экономика.'],
  ['offers', 'OfferDetailPage', 'Карточка оффера', 'Версии, статус модерации, показатели.'],
  ['offers', 'CodeBatchesPage', 'Промокоды', 'Партии промокодов: загрузка, предпросмотр, отчёт.'],
  ['integration', 'IntegrationPage', 'Интеграция', 'Уровень, коннектор, окружение, состояние здоровья.'],
  ['integration', 'SandboxPage', 'Sandbox', 'Тестовые заказы и журнал событий интеграции.'],
  ['promotion', 'PromotionPage', 'Продвижение', 'Заявки на продвижение: гео, аудитория, канал.'],
  ['orders', 'OrderListPage', 'Заказы', 'Список заказов: lifecycle, оплата, спор.'],
  ['orders', 'OrderDetailPage', 'Заказ', 'Единый ID, история статусов, переходы.'],
  ['settlements', 'SettlementListPage', 'Расчёты', 'Периоды расчётов и статусы выплат.'],
  ['settlements', 'SettlementDetailPage', 'Расчётный период', 'Построчная разбивка начислений и удержаний.'],
  ['analytics', 'AnalyticsPage', 'Аналитика', 'Воронка, показатели по офферам и каналам.'],
  ['team', 'TeamPage', 'Команда', 'Пользователи, роли, блокировка доступа.'],
  ['support', 'SupportPage', 'Поддержка', 'Обращения и переписка с КАМ.'],
  ['notifications', 'NotificationsPage', 'Уведомления', 'Лента событий и настройки оповещений.'],
  ['admin', 'AdminHomePage', 'Очереди', 'Сводка очередей: проверка партнёров, модерация, выплаты.'],
  ['admin', 'PartnerQueuePage', 'Партнёры', 'Очередь проверки партнёров.'],
  ['admin', 'PartnerDetailPage', 'Партнёр', 'Детальная карточка партнёра и решение по проверке.'],
  ['admin', 'OfferModerationQueuePage', 'Модерация офферов', 'Очередь модерации с постраничными замечаниями.'],
  ['admin', 'OfferModerationDetailPage', 'Модерация оффера', 'Сравнение версии оффера и решение модератора.'],
  ['admin', 'PayoutQueuePage', 'Выплаты', 'Очередь подтверждения расчётных периодов.'],
  ['admin', 'PayoutDetailPage', 'Расчётный период', 'Детали периода и подтверждение выплаты.'],
]

const root = path.join(__dirname, '..', 'src', 'pages')

for (const [folder, name, title, description] of pages) {
  const dir = path.join(root, folder)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${name}.tsx`)
  if (fs.existsSync(file)) continue // не перезаписываем уже наполненные страницы
  const content = `import { PagePlaceholder } from '@/components/PagePlaceholder'

export function ${name}() {
  return <PagePlaceholder title="${title}" description="${description}" />
}
`
  fs.writeFileSync(file, content, 'utf8')
}

console.log(`Сгенерировано страниц: ${pages.length}`)
