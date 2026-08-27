import { create } from 'zustand';
import { SettingsRepository } from '../database/repositories/SettingsRepository.js';

const settingsRepo = new SettingsRepository();

export const DEFAULT_MODULE_LABELS = {
  dashboard: 'الرئيسية',
  pos: 'نقاط البيع',
  invoices: 'الفواتير',
  analytics: 'التحليلات',
  online: 'أونلاين',
  returns: 'المرتجعات',
  debtors: 'الديون',
  inventory: 'المخزون',
  purchases: 'المشتريات',
  barcodes: 'استوديو الباركود',
  withdrawals: 'السحوبات',
  capital: 'الضخ',
  gifts: 'الهدايا',
  losses: 'الفاقد',
  mixlab: 'المختبر',
  discounts: 'الخصومات',
  categories: 'التصنيفات',
  notes: 'الملاحظات',
  advisor: 'المستشار AI',
  shift: 'إغلاق الوردية',
  settings: 'الإعدادات'
};

const STORAGE_KEY = 'aldaffa_custom_labels';

const loadStoredLabels = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_MODULE_LABELS, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Error loading labels from localStorage:', e);
  }
  return { ...DEFAULT_MODULE_LABELS };
};

export const useLabelsStore = create((set, get) => ({
  labels: loadStoredLabels(),

  loadFromDatabase: async () => {
    try {
      const dbValue = await settingsRepo.getValue('custom_labels');
      if (dbValue) {
        const parsed = JSON.parse(dbValue);
        const merged = { ...DEFAULT_MODULE_LABELS, ...parsed };
        set({ labels: merged });
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        } catch (e) {}
        return merged;
      }
    } catch (err) {
      console.warn('Could not load custom_labels from database:', err);
    }
    return get().labels;
  },

  setLabel: (moduleId, customLabel) => {
    set((state) => {
      const updated = { ...state.labels, [moduleId]: customLabel || DEFAULT_MODULE_LABELS[moduleId] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        settingsRepo.setValue('custom_labels', JSON.stringify(updated)).catch(() => {});
      } catch (e) {
        console.error('Error saving labels:', e);
      }
      return { labels: updated };
    });
  },

  setAllLabels: (newLabels) => {
    set(() => {
      const merged = { ...DEFAULT_MODULE_LABELS, ...newLabels };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        settingsRepo.setValue('custom_labels', JSON.stringify(merged)).catch(() => {});
      } catch (e) {
        console.error('Error saving labels:', e);
      }
      return { labels: merged };
    });
  },

  resetLabels: () => {
    set(() => {
      try {
        localStorage.removeItem(STORAGE_KEY);
        settingsRepo.setValue('custom_labels', JSON.stringify(DEFAULT_MODULE_LABELS)).catch(() => {});
      } catch (e) {
        console.error('Error clearing custom labels:', e);
      }
      return { labels: { ...DEFAULT_MODULE_LABELS } };
    });
  }
}));
