import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FeatureFlagsProvider, featureFlagsQueryKey } from './FeatureFlagsProvider'
import { useFeatureFlag } from './useFeatureFlag'

interface TestFlags {
  'cabinet.new-checkout': boolean
}

const clients: QueryClient[] = []

// Свой QueryClient на тест. Провайдер сам задаёт retry: 2 — это параметр запроса, он сильнее
// defaultOptions. Поэтому retry: false из defaultOptions на флаги не действует, а retryDelay: 0
// (провайдер его не задаёт) делает оба повтора сразу — тест не ждёт реальных задержек.
function createQueryClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } })
  clients.push(client)
  return client
}

afterEach(() => {
  for (const client of clients.splice(0)) {
    client.clear()
  }
})

function NewCheckout() {
  const enabled = useFeatureFlag<TestFlags>('cabinet.new-checkout')
  return <p>{enabled ? 'Новое оформление' : 'Старое оформление'}</p>
}

function renderProvider(
  load: (signal: AbortSignal) => Promise<TestFlags>,
  client = createQueryClient(),
) {
  render(
    <QueryClientProvider client={client}>
      <FeatureFlagsProvider load={load} fallback={<p>Загрузка флагов</p>}>
        <NewCheckout />
      </FeatureFlagsProvider>
    </QueryClientProvider>,
  )
  return client
}

describe('FeatureFlagsProvider', () => {
  it('показывает fallback, пока первый ответ не пришёл (К5)', async () => {
    const response = Promise.withResolvers<TestFlags>()

    renderProvider(() => response.promise)

    expect(screen.getByText('Загрузка флагов')).toBeInTheDocument()
    expect(screen.queryByText(/оформление/)).toBeNull()

    await act(async () => {
      response.resolve({ 'cabinet.new-checkout': true })
      await response.promise
    })

    expect(await screen.findByText('Новое оформление')).toBeInTheDocument()
    expect(screen.queryByText('Загрузка флагов')).toBeNull()
  })

  it('показывает children с флагами из ответа (К5)', async () => {
    renderProvider(() => Promise.resolve({ 'cabinet.new-checkout': true }))

    expect(await screen.findByText('Новое оформление')).toBeInTheDocument()
  })

  it('передаёт в load сигнал отмены запроса (К5)', async () => {
    const load = vi.fn((_signal: AbortSignal) => Promise.resolve({ 'cabinet.new-checkout': false }))

    renderProvider(load)

    expect(await screen.findByText('Старое оформление')).toBeInTheDocument()
    expect(load).toHaveBeenCalledWith(expect.any(AbortSignal))
  })

  it('показывает новые флаги после обновления (К5)', async () => {
    const load = vi.fn<(signal: AbortSignal) => Promise<TestFlags>>()
    load.mockResolvedValueOnce({ 'cabinet.new-checkout': false })
    load.mockResolvedValueOnce({ 'cabinet.new-checkout': true })
    const client = renderProvider(load)
    expect(await screen.findByText('Старое оформление')).toBeInTheDocument()

    await act(() => client.refetchQueries({ queryKey: featureFlagsQueryKey }))

    expect(await screen.findByText('Новое оформление')).toBeInTheDocument()
  })

  it('при ошибке первой загрузки после повторов показывает children, все флаги выключены (К6)', async () => {
    const load = vi.fn<(signal: AbortSignal) => Promise<TestFlags>>()
    load.mockRejectedValue(new Error('gateway недоступен'))

    renderProvider(load)

    expect(await screen.findByText('Старое оформление')).toBeInTheDocument()
    expect(screen.queryByText('Загрузка флагов')).toBeNull()
    // Первая попытка и два повтора.
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('при ошибке обновления оставляет флаги из последнего ответа (К6)', async () => {
    const load = vi.fn<(signal: AbortSignal) => Promise<TestFlags>>()
    load.mockResolvedValueOnce({ 'cabinet.new-checkout': true })
    load.mockRejectedValue(new Error('gateway недоступен'))
    const client = renderProvider(load)
    expect(await screen.findByText('Новое оформление')).toBeInTheDocument()

    await act(() => client.refetchQueries({ queryKey: featureFlagsQueryKey }))

    await waitFor(() => {
      expect(client.getQueryState(featureFlagsQueryKey)?.status).toBe('error')
    })
    expect(screen.getByText('Новое оформление')).toBeInTheDocument()
  })
})
