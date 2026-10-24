/** Куда вести при клике по уведомлению — по типу связанной сущности. */
export const ENTITY_ROUTE: Record<string, (id: string) => string> = {
  offer: (id) => `/offers/${id}`,
  order: (id) => `/orders/${id}`,
  partner: () => `/organization`,
  settlement: (id) => `/settlements/${id}`,
  conversion_drop: () => `/analytics`,
  integration_upgrade: () => `/integration`,
}
