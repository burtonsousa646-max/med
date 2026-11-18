import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { FeatureFlagsProvider } from './FeatureFlagsProvider'
import { FeatureFlagsTestProvider } from './FeatureFlagsTestProvider'
import { useFeatureFlag } from './useFeatureFlag'

interface TestFlags {
  'cabinet.on': boolean
  'cabinet.off': boolean
  'cabinet.missing': boolean
}

const clients: QueryClient[] = []

afterEach(() => {
  for (const client of clients.splice(0)) {
    client.clear()
  }
})

function Flag({ name }: { name: keyof TestFlags }) {
  const enabled = useFeatureFlag<TestFlags>(name)
  return (
    <p>
      {name}: {enabled ? 'включён' : 'выключен'}
    </p>
  )
}

function Flags() {
  return (
    <>
      <Flag name="cabinet.on" />
      <Flag name="cabinet.off" />
      <Flag name="cabinet.missing" />
    </>
  )
}

function renderWithResponse(response: object) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  render(
    <QueryClientProvider client={client}>
      <FeatureFlagsProvider load={() => Promise.resolve(response)}>
        <Flags />
      </FeatureFlagsProvider>
    </QueryClientProvider>,
  )
}

describe('useFeatureFlag', () => {
  it('возвращает true и false по ответу gateway (К7)', async () => {
    renderWithResponse({ 'cabinet.on': true, 'cabinet.off': false })

    expect(await screen.findByText('cabinet.on: включён')).toBeInTheDocument()
    expect(screen.getByText('cabinet.off: выключен')).toBeInTheDocument()
  })

  it('считает выключенным флаг, которого нет в ответе (К7)', async () => {
    renderWithResponse({ 'cabinet.on': true })

    expect(await screen.findByText('cabinet.missing: выключен')).toBeInTheDocument()
  })

  it('считает выключенным флаг, значение которого в ответе не boolean (К7)', async () => {
    renderWithResponse({ 'cabinet.on': 'true', 'cabinet.off': 1 })

    expect(await screen.findByText('cabinet.on: выключен')).toBeInTheDocument()
    expect(screen.getByText('cabinet.off: выключен')).toBeInTheDocument()
  })

  it('сообщает понятной ошибкой, если host не подключил FeatureFlagsProvider (К7)', () => {
    expect(() => render(<Flag name="cabinet.on" />)).toThrow(
      'Флаги не переданы: host должен подключить FeatureFlagsProvider выше по дереву',
    )
  })
})

describe('FeatureFlagsTestProvider', () => {
  it('отдаёт хуку флаги теста без запроса к gateway (К7)', () => {
    render(
      <FeatureFlagsTestProvider<TestFlags> flags={{ 'cabinet.on': true, 'cabinet.off': false }}>
        <Flags />
      </FeatureFlagsTestProvider>,
    )

    expect(screen.getByText('cabinet.on: включён')).toBeInTheDocument()
    expect(screen.getByText('cabinet.off: выключен')).toBeInTheDocument()
    expect(screen.getByText('cabinet.missing: выключен')).toBeInTheDocument()
  })
})
