export type OfferImageInput = { category: string; title: string; variant: number }

export function isOfferImageInput(value: unknown): value is OfferImageInput {
  if (!value || typeof value !== 'object') return false
  const input = value as OfferImageInput
  return typeof input.category === 'string' && input.category.trim().length >= 3 && input.category.length <= 100
    && typeof input.title === 'string' && input.title.trim().length >= 5 && input.title.length <= 90
    && Number.isSafeInteger(input.variant) && input.variant >= 0 && input.variant < 1_000_000
}
