/**
 * UI Store - Global UI State Management
 * Manages modals, toasts, loading states, sidebar
 */

import { create } from 'zustand';

let toastIdCounter = 0;

// Get initial theme from localStorage or default to 'atelier' (Organic Daylight Atelier)
const initialTheme = (() => {
  try {
    const saved = localStorage.getItem('aldaffa_theme');
    if (saved === 'dark' || saved === 'atelier') return saved;
  } catch (e) {}
  return 'atelier';
})();

if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-theme', initialTheme);
}

export const useUIStore = create((set, get) => ({
  // Theme state: 'atelier' (Daylight Organic Atelier) | 'dark' (Nocturne Obsidian)
  theme: initialTheme,
  setTheme: (newTheme) => {
    try {
      localStorage.setItem('aldaffa_theme', newTheme);
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', newTheme);
      }
    } catch (e) {}
    set({ theme: newTheme });
  },
  toggleTheme: () => {
    const current = get().theme;
    const next = current === 'atelier' ? 'dark' : 'atelier';
    get().setTheme(next);
  },

  // State
  sidebarOpen: false,
  activeModal: null,
  toasts: [],
  globalLoading: false,

  // Sidebar
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  openSidebar: () => set({ sidebarOpen: true }),

  closeSidebar: () => set({ sidebarOpen: false }),

  // Modals
  openModal: (modalConfig) => set({ activeModal: modalConfig }),

  closeModal: () => set({ activeModal: null }),

  // Toasts
  addToast: (toast) => {
    const id = `toast-${++toastIdCounter}`;
    const newToast = {
      id,
      type: toast.type || 'info',
      message: toast.message,
      duration: toast.duration || 5000
    };

    set((state) => ({
      toasts: [...state.toasts, newToast]
    }));

    // Auto-remove after duration
    if (newToast.duration > 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, newToast.duration);
    }

    return id;
  },

  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter(t => t.id !== id)
  })),

  clearToasts: () => set({ toasts: [] }),

  // Helpers for common toast types
  showSuccess: (message, duration) => {
    return get().addToast({ type: 'success', message, duration });
  },

  showError: (message, duration) => {
    return get().addToast({ type: 'error', message, duration });
  },

  showWarning: (message, duration) => {
    return get().addToast({ type: 'warning', message, duration });
  },

  showInfo: (message, duration) => {
    return get().addToast({ type: 'info', message, duration });
  },

  // Global loading
  setGlobalLoading: (loading) => set({ globalLoading: loading })
}));
