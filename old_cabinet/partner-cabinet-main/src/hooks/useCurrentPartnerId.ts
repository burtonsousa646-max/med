import { useSessionStore } from '@/stores/sessionStore'

/** partnerId текущего вошедшего пользователя партнёрской стороны (undefined для internal-ролей). */
export function useCurrentPartnerId(): string | undefined {
  return useSessionStore((s) => s.identity?.partnerId)
}
