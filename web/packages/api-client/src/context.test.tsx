import { render, renderHook, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { createApi } from './client'
import { ApiProvider, useApi } from './context'

describe('ApiProvider и useApi', () => {
  it('отдают module тот же экземпляр клиента, что создал host', () => {
    const client = createApi<object>()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider client={client}>{children}</ApiProvider>
    )

    const { result } = renderHook(() => useApi<object>(), { wrapper })

    expect(result.current).toBe(client)
  })

  it('сообщают понятной ошибкой, если host не подключил ApiProvider', () => {
    function Module() {
      useApi<object>()
      return <p>module</p>
    }

    expect(() => render(<Module />)).toThrow('host должен подключить ApiProvider')
    expect(screen.queryByText('module')).toBeNull()
  })
})
