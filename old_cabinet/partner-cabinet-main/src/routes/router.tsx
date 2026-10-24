import { createBrowserRouter, Navigate } from 'react-router-dom'
import { CabinetLayout } from '@/layouts/CabinetLayout'
import { AdminLayout } from '@/layouts/AdminLayout'
import { OnboardingLayout } from '@/layouts/OnboardingLayout'
import { LoginPage } from '@/pages/login/LoginPage'
import { lazyPage } from './lazyPage'

const LandingPage = lazyPage(() => import('@/pages/landing/LandingPage'), 'LandingPage')
const CalculatorPage = lazyPage(() => import('@/pages/calculator/CalculatorPage'), 'CalculatorPage')
const PublicOfferPage = lazyPage(() => import('@/pages/offer/PublicOfferPage'), 'PublicOfferPage')
const AssistantPage = lazyPage(() => import('@/pages/assistant/AssistantPage'), 'AssistantPage')
const RegistrationPage = lazyPage(() => import('@/pages/onboarding/RegistrationPage'), 'RegistrationPage')
const OnboardingOrganizationPage = lazyPage(() => import('@/pages/onboarding/OrganizationPage'), 'OrganizationPage')
const OnboardingVerificationPage = lazyPage(() => import('@/pages/onboarding/VerificationPage'), 'VerificationPage')
const AgreementPage = lazyPage(() => import('@/pages/onboarding/AgreementPage'), 'AgreementPage')
const OnboardingIntegrationPage = lazyPage(() => import('@/pages/onboarding/IntegrationPage'), 'IntegrationPage')
const BrandPage = lazyPage(() => import('@/pages/onboarding/BrandPage'), 'BrandPage')
const FirstOfferPage = lazyPage(() => import('@/pages/onboarding/FirstOfferPage'), 'FirstOfferPage')
const DashboardPage = lazyPage(() => import('@/pages/dashboard/DashboardPage'), 'DashboardPage')
const OrganizationPage = lazyPage(() => import('@/pages/organization/OrganizationPage'), 'OrganizationPage')
const OutletsPage = lazyPage(() => import('@/pages/organization/OutletsPage'), 'OutletsPage')
const VerificationPage = lazyPage(() => import('@/pages/verification/VerificationPage'), 'VerificationPage')
const DocumentsPage = lazyPage(() => import('@/pages/documents/DocumentsPage'), 'DocumentsPage')
const OfferCatalogPage = lazyPage(() => import('@/pages/offers/OfferCatalogPage'), 'OfferCatalogPage')
const OfferConstructorPage = lazyPage(() => import('@/pages/offers/OfferConstructorPage'), 'OfferConstructorPage')
const OfferDetailPage = lazyPage(() => import('@/pages/offers/OfferDetailPage'), 'OfferDetailPage')
const CodeBatchesPage = lazyPage(() => import('@/pages/offers/CodeBatchesPage'), 'CodeBatchesPage')
const IntegrationPage = lazyPage(() => import('@/pages/integration/IntegrationPage'), 'IntegrationPage')
const SandboxPage = lazyPage(() => import('@/pages/integration/SandboxPage'), 'SandboxPage')
const PromotionPage = lazyPage(() => import('@/pages/promotion/PromotionPage'), 'PromotionPage')
const OrderListPage = lazyPage(() => import('@/pages/orders/OrderListPage'), 'OrderListPage')
const OrderDetailPage = lazyPage(() => import('@/pages/orders/OrderDetailPage'), 'OrderDetailPage')
const SettlementListPage = lazyPage(() => import('@/pages/settlements/SettlementListPage'), 'SettlementListPage')
const SettlementDetailPage = lazyPage(() => import('@/pages/settlements/SettlementDetailPage'), 'SettlementDetailPage')
const AnalyticsPage = lazyPage(() => import('@/pages/analytics/AnalyticsPage'), 'AnalyticsPage')
const TeamPage = lazyPage(() => import('@/pages/team/TeamPage'), 'TeamPage')
const SupportPage = lazyPage(() => import('@/pages/support/SupportPage'), 'SupportPage')
const NotificationsPage = lazyPage(() => import('@/pages/notifications/NotificationsPage'), 'NotificationsPage')
const AdminHomePage = lazyPage(() => import('@/pages/admin/AdminHomePage'), 'AdminHomePage')
const PartnerQueuePage = lazyPage(() => import('@/pages/admin/PartnerQueuePage'), 'PartnerQueuePage')
const PartnerDetailPage = lazyPage(() => import('@/pages/admin/PartnerDetailPage'), 'PartnerDetailPage')
const OfferModerationQueuePage = lazyPage(() => import('@/pages/admin/OfferModerationQueuePage'), 'OfferModerationQueuePage')
const OfferModerationDetailPage = lazyPage(() => import('@/pages/admin/OfferModerationDetailPage'), 'OfferModerationDetailPage')
const PayoutQueuePage = lazyPage(() => import('@/pages/admin/PayoutQueuePage'), 'PayoutQueuePage')
const PayoutDetailPage = lazyPage(() => import('@/pages/admin/PayoutDetailPage'), 'PayoutDetailPage')

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/calculator', element: <CalculatorPage /> },
  { path: '/offer', element: <PublicOfferPage /> },
  { path: '/login', element: <LoginPage /> },
  {
    path: '/onboarding',
    element: <OnboardingLayout />,
    children: [
      { index: true, element: <Navigate to="registration" replace /> },
      { path: 'registration', element: <RegistrationPage /> },
      { path: 'organization', element: <OnboardingOrganizationPage /> },
      { path: 'verification', element: <OnboardingVerificationPage /> },
      { path: 'agreement', element: <AgreementPage /> },
      { path: 'integration', element: <OnboardingIntegrationPage /> },
      { path: 'brand', element: <BrandPage /> },
      { path: 'first-offer', element: <FirstOfferPage /> },
    ],
  },
  {
    element: <CabinetLayout />,
    children: [
      { path: '/assistant', element: <AssistantPage />, handle: { crumb: 'Помощник' } },
      { path: '/dashboard', element: <DashboardPage />, handle: { crumb: 'Обзор' } },
      { path: '/organization', element: <OrganizationPage />, handle: { crumb: 'Организация' } },
      { path: '/organization/outlets', element: <OutletsPage />, handle: { crumb: 'Точки' } },
      { path: '/verification', element: <VerificationPage />, handle: { crumb: 'Проверка' } },
      { path: '/documents', element: <DocumentsPage />, handle: { crumb: 'Документы' } },
      { path: '/offers', element: <OfferCatalogPage />, handle: { crumb: 'Офферы' } },
      { path: '/offers/new', element: <OfferConstructorPage />, handle: { crumb: 'Новый оффер' } },
      { path: '/offers/:offerId', element: <OfferDetailPage />, handle: { crumb: 'Оффер' } },
      { path: '/offers/:offerId/edit', element: <OfferConstructorPage />, handle: { crumb: 'Редактирование оффера' } },
      { path: '/offers/:offerId/codes', element: <CodeBatchesPage />, handle: { crumb: 'Промокоды' } },
      { path: '/integration', element: <IntegrationPage />, handle: { crumb: 'Интеграция' } },
      { path: '/integration/sandbox', element: <SandboxPage />, handle: { crumb: 'Sandbox' } },
      { path: '/promotion', element: <PromotionPage />, handle: { crumb: 'Продвижение' } },
      { path: '/orders', element: <OrderListPage />, handle: { crumb: 'Заказы' } },
      { path: '/orders/:orderId', element: <OrderDetailPage />, handle: { crumb: 'Заказ' } },
      { path: '/settlements', element: <SettlementListPage />, handle: { crumb: 'Расчёты' } },
      { path: '/settlements/:settlementId', element: <SettlementDetailPage />, handle: { crumb: 'Расчётный период' } },
      { path: '/analytics', element: <AnalyticsPage />, handle: { crumb: 'Аналитика' } },
      { path: '/team', element: <TeamPage />, handle: { crumb: 'Команда' } },
      { path: '/support', element: <SupportPage />, handle: { crumb: 'Поддержка' } },
      { path: '/notifications', element: <NotificationsPage />, handle: { crumb: 'Уведомления' } },
    ],
  },
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <AdminHomePage />, handle: { crumb: 'Очереди' } },
      { path: 'partners', element: <PartnerQueuePage />, handle: { crumb: 'Партнёры' } },
      { path: 'partners/:partnerId', element: <PartnerDetailPage />, handle: { crumb: 'Партнёр' } },
      { path: 'offers', element: <OfferModerationQueuePage />, handle: { crumb: 'Модерация офферов' } },
      { path: 'offers/:offerId', element: <OfferModerationDetailPage />, handle: { crumb: 'Модерация оффера' } },
      { path: 'settlements', element: <PayoutQueuePage />, handle: { crumb: 'Выплаты' } },
      { path: 'settlements/:settlementId', element: <PayoutDetailPage />, handle: { crumb: 'Расчётный период' } },
    ],
  },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
])
