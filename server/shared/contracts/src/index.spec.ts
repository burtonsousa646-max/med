import { loadSync, type MethodDefinition } from '@grpc/proto-loader'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { PROTO_LOADER_OPTIONS, protoPath } from './index.js'

const fixtures = fileURLToPath(new URL('./__fixtures__/', import.meta.url))

/** Метод сервиса из образца: proto-loader сериализует сообщения с переданными опциями. */
function echoMethod(): MethodDefinition<object, object> {
  const definition = loadSync('sample/v1/sample.proto', {
    ...PROTO_LOADER_OPTIONS,
    includeDirs: [fixtures],
  })
  const service = definition['sample.v1.SampleService'] as Record<
    string,
    MethodDefinition<object, object>
  >
  const method = service['Echo']
  if (!method) throw new Error('в образце нет метода Echo')
  return method
}

describe('PROTO_LOADER_OPTIONS', () => {
  it('отдаёт данные в форме типов ts-proto: camelCase, int64 строкой, перечисления строками', () => {
    const method = echoMethod()
    const message = { sampleId: 'a1', amountKop: '150000', status: 'SAMPLE_STATUS_ACTIVE' }

    const decoded = method.requestDeserialize(method.requestSerialize(message))

    expect(decoded).toEqual(message)
  })

  it('заполняет отсутствующие поля значениями по умолчанию', () => {
    const method = echoMethod()

    const decoded = method.requestDeserialize(method.requestSerialize({}))

    expect(decoded).toEqual({ sampleId: '', amountKop: '0', status: 'SAMPLE_STATUS_UNSPECIFIED' })
  })
})

describe('protoPath', () => {
  it('указывает на .proto внутри собранного пакета', () => {
    expect(protoPath('campaigns/v1/campaigns.proto')).toMatch(
      /\/proto\/campaigns\/v1\/campaigns\.proto$/,
    )
  })
})
