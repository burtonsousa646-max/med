// Demonstration fixture only; never submitted to a service.
export const DEMO_BUSINESS = {
  inn: '1234567894', phone: '+7 (900) 000-00-01', name: 'кофейня «Зерно»',
  category: 'кофе и завтраки', city: 'Москва', website: '',
}
export const DEMO_PROFILE = { ...DEMO_BUSINESS, registeredAddress: 'ул. Покровка, 12' }
export type DemoBusinessProfile = typeof DEMO_PROFILE
