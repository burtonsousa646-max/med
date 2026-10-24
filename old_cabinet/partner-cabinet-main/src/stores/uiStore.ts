import { create } from 'zustand'

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  tone: ToastTone
  title: string
  description?: string
}

interface UiState {
  sidebarOpen: boolean
  toggleSidebar: () => void
  closeSidebar: () => void
  toasts: ToastItem[]
  pushToast: (toast: Omit<ToastItem, 'id'>) => void
  dismissToast: (id: string) => void
}

export const useUiStore = create<UiState>()((set) => ({
  sidebarOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  closeSidebar: () => set({ sidebarOpen: false }),
  toasts: [],
  pushToast: (toast) =>
    set((s) => ({
      toasts: [...s.toasts, { ...toast, id: crypto.randomUUID() }],
    })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
