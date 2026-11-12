import type { components } from '../src/api.gen.ts'

type Schemas = components['schemas']
export type OfferAiInput = Schemas['OfferAiInput']
export type OfferAiAnswer = Schemas['OfferAiAnswer']
export type OfferAiResponse = Schemas['OfferAiResponse']

export function offerAiNotes(answer: OfferAiAnswer): string[] {
  return [
    ...answer.options.map(option => option.headline + (option.missingFacts.length ? ' · Уточнить ' + option.missingFacts.join(', ') : '')),
    ...(answer.question ? [answer.question] : []),
    ...(answer.visual.action === 'generate'
      ? ['Для генерации нового изображения нужен отдельный инструмент. Можно загрузить готовый файл вручную.'] : []),
  ]
}
