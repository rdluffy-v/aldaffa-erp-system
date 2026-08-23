/**
 * Labels Store - Dynamic Navigation & UI Label Customization
 * Manages tab labels, persistence to localStorage & SQLite settings
 */

import { create } from 'zustand';

export const DEFAULT_MODULE_LABELS = {
  dashboard: 'الرئيسية',
  pos: 'نقاط البيع',
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

  setLabel: (moduleId, customLabel) => {
    set((state) => {
      const updated = { ...state.labels, [moduleId]: customLabel || DEFAULT_MODULE_LABELS[moduleId] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
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
      } catch (e) {
        console.error('Error clearing custom labels:', e);
      }
      return { labels: { ...DEFAULT_MODULE_LABELS } };
    });
  }
}));
