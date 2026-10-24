import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DemoIdentity } from '@/types/session'

interface SessionState {
  identity: DemoIdentity | null
  signOut: () => void
  /** Вход по идентичности, собранной из записи Membership в хранилище (seed или
   *  созданная в ходе регистрации) — единственный способ входа в демо, см. LoginPage/Topbar. */
  signInAsCustom: (identity: DemoIdentity) => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      identity: null,
      signOut: () => set({ identity: null }),
      signInAsCustom: (identity) => set({ identity }),
    }),
    { name: 'med-cabinet-session' },
  ),
)
