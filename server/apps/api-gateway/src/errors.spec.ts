import { status } from '@grpc/grpc-js'
import { describe, expect, it } from 'vitest'
import { GatewayError, normalizeError, PublicOnlyAccessPolicy } from './errors.ts'

describe('нормализация ошибок gateway', () => {
  it.each([
    [status.INVALID_ARGUMENT, 400, 'invalid_request'],
    [status.UNAUTHENTICATED, 401, 'unauthenticated'],
    [status.PERMISSION_DENIED, 403, 'permission_denied'],
    [status.NOT_FOUND, 404, 'not_found'],
    [status.ALREADY_EXISTS, 409, 'conflict'],
    [status.ABORTED, 409, 'conflict'],
    [status.FAILED_PRECONDITION, 422, 'business_rule_violation'],
    [status.DEADLINE_EXCEEDED, 503, 'service_unavailable'],
    [status.RESOURCE_EXHAUSTED, 503, 'service_unavailable'],
    [status.UNAVAILABLE, 503, 'service_unavailable'],
    [status.INTERNAL, 500, 'internal_error'],
  ])('K7: преобразует gRPC-код %s в HTTP %s без текста upstream', (grpcCode, httpStatus, code) => {
    const result = normalizeError({ code: grpcCode, message: 'synthetic-secret' })

    expect(result.status).toBe(httpStatus)
    expect(result.body.code).toBe(code)
    expect(JSON.stringify(result)).not.toContain('synthetic-secret')
  })

  it('K7: возвращает 429 для явно распознанного ограничения клиента', () => {
    expect(normalizeError(new GatewayError(429))).toEqual({
      status: 429,
      body: { code: 'rate_limit_exceeded', message: 'Превышен лимит запросов' },
    })
  })
})

describe('политика доступа к операциям', () => {
  it('K6: допускает только явно публичную операцию', () => {
    const policy = new PublicOnlyAccessPolicy()

    expect(() => {
      policy.assertAllowed({ security: [] })
    }).not.toThrow()
    expect(() => {
      policy.assertAllowed({})
    }).toThrow(GatewayError)
    expect(() => {
      policy.assertAllowed({ security: [{ session: [] }] })
    }).toThrow(GatewayError)
  })
})
