import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface OnboardingContact {
  lastName: string
  firstName: string
  phone: string
  email: string
}

interface OnboardingState {
  contact: OnboardingContact | null
  draftPartnerId: string | null
  setContact: (contact: OnboardingContact) => void
  setDraftPartnerId: (id: string) => void
  reset: () => void
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      contact: null,
      draftPartnerId: null,
      setContact: (contact) => set({ contact }),
      setDraftPartnerId: (id) => set({ draftPartnerId: id }),
      reset: () => set({ contact: null, draftPartnerId: null }),
    }),
    { name: 'med-cabinet-onboarding' },
  ),
)
