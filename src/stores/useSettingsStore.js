/**
 * Application Universal Settings Store
 * Provides real-time reactive access and SQLite persistence for all system settings
 */

import { create } from 'zustand';
import { SettingsRepository } from '../database/repositories/SettingsRepository.js';

const settingsRepo = new SettingsRepository();

export const DEFAULT_SETTINGS = {
  // Store & Business Identity
  store_name: 'الدفة للعطور',
  store_subtitle: 'Aldaffa Perfumes - لأرقى العطور والخلطات',
  store_phone: '0123456789',
  store_address: 'ليبيا - مصراتة',
  currency_symbol: 'د.ل',
  currency_name: 'دينار ليبي',
  tax_rate: '0',
  commercial_reg: '',
  tax_id: '',

  // Inventory & Sales Preferences
  low_stock_threshold: '10',
  default_payment_method: 'cash',
  enable_wholesale: '1',
  enable_price_override: '1',
  invoice_prefix: 'INV-',
  purchase_prefix: 'PUR-',
  default_unit: 'piece',
  auto_calculate_wac: '1',
  sound_effects: '1',

  // Print & Receipt Studio
  print_mode: 'thermal', // 'thermal' | 'a4'
  thermal_paper_width: '80mm', // '80mm' | '58mm'
  receipt_theme: 'luxury_gold', // 'classic' | 'luxury_gold' | 'modern_minimal' | 'ornate_box'
  receipt_font_size: 'md', // 'sm' | 'md' | 'lg'
  receipt_border: 'dashed', // 'dashed' | 'solid' | 'double' | 'none'
  receipt_greeting: 'شكراً لتسوقكم معنا .. نسعد بخدمتكم دائماً',
  receipt_policy: 'سياسة الاستبدال والاسترجاع: خلال 30 ساعة مع الفاتورة الأصلية. المنتجات المفتوحة لا تسترجع.',
  auto_print_on_checkout: '0',
  show_logo: '1',
  show_barcode: '1',
  show_cashier: '1',
  show_phone: '1',
  show_customer_info: '1',
  logo_base64: '',

  // UI Theme & Appearance
  theme_accent: 'gold', // 'gold' | 'emerald' | 'sapphire' | 'amber' | 'rose'
  ui_density: 'comfortable', // 'compact' | 'comfortable' | 'spacious'
  animation_speed: 'normal', // 'normal' | 'fast' | 'reduced'

  // AI & Vision Settings
  gemini_api_key: '',
  ai_provider: 'gemini',
  ai_model_name: 'gemini-2.5-flash',
  ai_api_url: '',
  ocr_confidence: '0.8',

  // System & Security
  sandbox_mode: '0',
  auto_backup_enabled: '1',
  backup_frequency: 'daily',
  backup_retention_days: '30'
};

export const useSettingsStore = create((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  loading: false,
  loaded: false,
  error: null,

  // Load all settings from SQLite
  loadSettings: async () => {
    set({ loading: true, error: null });
    try {
      const allRows = await settingsRepo.findAll();
      const loadedMap = { ...DEFAULT_SETTINGS };

      if (Array.isArray(allRows)) {
        allRows.forEach((row) => {
          if (row.key && row.value !== undefined && row.value !== null) {
            loadedMap[row.key] = row.value;
          }
        });
      }

      if (typeof window !== 'undefined') {
        window.__CURRENCY_SYMBOL__ = loadedMap.currency_symbol || DEFAULT_SETTINGS.currency_symbol;
      }

      set({ settings: loadedMap, loading: false, loaded: true });
      return loadedMap;
    } catch (err) {
      console.error('Failed to load settings:', err);
      set({ error: err.message, loading: false, loaded: true });
      return DEFAULT_SETTINGS;
    }
  },

  // Get single setting with fallback
  getSetting: (key, fallback = '') => {
    const val = get().settings[key];
    if (val !== undefined && val !== null && val !== '') return val;
    return DEFAULT_SETTINGS[key] !== undefined ? DEFAULT_SETTINGS[key] : fallback;
  },

  // Update single setting
  setSetting: async (key, value) => {
    const strVal = String(value);
    set((state) => ({
      settings: { ...state.settings, [key]: strVal }
    }));
    try {
      await settingsRepo.setValue(key, strVal);
      if (typeof window !== 'undefined') {
        if (key === 'currency_symbol') {
          window.__CURRENCY_SYMBOL__ = strVal;
        }
        window.dispatchEvent(new CustomEvent('aldaffa:settings-changed', { detail: { key, value: strVal } }));
      }
    } catch (err) {
      console.error(`Failed to persist setting ${key}:`, err);
    }
  },

  // Bulk update multiple settings at once
  saveMultipleSettings: async (settingsDict) => {
    const stringified = {};
    Object.keys(settingsDict).forEach((k) => {
      stringified[k] = String(settingsDict[k] ?? '');
    });

    if (typeof window !== 'undefined' && stringified.currency_symbol) {
      window.__CURRENCY_SYMBOL__ = stringified.currency_symbol;
    }

    set((state) => ({
      settings: { ...state.settings, ...stringified }
    }));

    try {
      await settingsRepo.setMultipleValues(stringified);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aldaffa:settings-changed', { detail: stringified }));
      }
      return { success: true };
    } catch (err) {
      console.error('Failed bulk saving settings:', err);
      return { success: false, error: err.message };
    }
  },

  // Reset all settings to factory default
  resetToDefaults: async () => {
    if (typeof window !== 'undefined') {
      window.__CURRENCY_SYMBOL__ = DEFAULT_SETTINGS.currency_symbol;
    }
    set({ settings: { ...DEFAULT_SETTINGS } });
    try {
      await settingsRepo.setMultipleValues(DEFAULT_SETTINGS);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aldaffa:settings-changed', { detail: DEFAULT_SETTINGS }));
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}));
