import { queryClient } from '../api'
import { sessionKey } from './MvpSession'
import { partnerDemo, mockStaffRequest } from './mvp-demo'

export const base = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '') + '/v4/staff'

export class StaffError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function staffRequest<T>(path: string, options: { body?: object; signal?: AbortSignal } = {}): Promise<T> {
  const { body, signal } = options
  if (partnerDemo) return await mockStaffRequest(path,body) as T
  const response = await fetch(base + path, {
    credentials: 'include', cache: 'no-store', signal,
    ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) {
    if (response.status === 401) queryClient.setQueryData(sessionKey, null)
    const error = await response.json().catch(() => null)
    throw new StaffError(response.status, error?.message ?? 'Не удалось выполнить запрос. Попробуйте ещё раз')
  }
  return response.json() as Promise<T>
}

