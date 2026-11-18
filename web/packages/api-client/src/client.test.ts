import { describe, expect, it } from 'vitest'

import { unwrap } from './client'
import { ApiRequestError, isApiRequestError } from './errors'

const response = (status: number) => new Response(null, { status })

describe('unwrap', () => {
  it('возвращает данные успешного ответа', () => {
    expect(unwrap({ data: { id: '1' }, response: response(200) })).toEqual({ id: '1' })
  })

  it('превращает ошибку из контракта в ApiRequestError с кодом, текстом и статусом', () => {
    const error = { code: 'campaign_not_found', message: 'Кампания не найдена' }

    let thrown: unknown
    try {
      unwrap({ error, response: response(404) })
    } catch (e) {
      thrown = e
    }

    expect(isApiRequestError(thrown)).toBe(true)
    expect(thrown).toMatchObject({
      status: 404,
      code: 'campaign_not_found',
      message: 'Кампания не найдена',
    })
  })

  it('показывает общий текст, если сервер ответил ошибкой не по контракту', () => {
    expect(() => unwrap({ error: 'Bad Gateway', response: response(502) })).toThrow(
      new ApiRequestError(502, {
        code: 'unknown_error',
        message: 'Что-то пошло не так. Попробуйте ещё раз.',
      }),
    )
  })

  it('считает ошибкой неуспешный статус без тела ошибки', () => {
    expect(() => unwrap({ response: response(500) })).toThrow(ApiRequestError)
  })
})
