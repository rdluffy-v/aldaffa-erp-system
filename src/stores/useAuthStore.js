/**
 * Authentication & Role-Based Permissions Store
 * Manages active user session, PIN authentication, and granular access control
 */

import { create } from 'zustand';
import { UsersRepository } from '../database/repositories/UsersRepository.js';

const usersRepo = new UsersRepository();

export const DEFAULT_MANAGER = {
  id: 'admin_1',
  name: 'المدير العام',
  role: 'manager',
  pin: '1234',
  permissions: {}
};

export const PERMISSION_KEYS = {
  // Modules Access
  MODULE_DASHBOARD: 'module_dashboard',
  MODULE_POS: 'module_pos',
  MODULE_ONLINE: 'module_online',
  MODULE_RETURNS: 'module_returns',
  MODULE_INVOICES: 'module_invoices',
  MODULE_DEBTORS: 'module_debtors',
  MODULE_INVENTORY: 'module_inventory',
  MODULE_PURCHASES: 'module_purchases',
  MODULE_BARCODES: 'module_barcodes',
  MODULE_WITHDRAWALS: 'module_withdrawals',
  MODULE_CAPITAL: 'module_capital',
  MODULE_GIFTS: 'module_gifts',
  MODULE_LOSSES: 'module_losses',
  MODULE_MIXLAB: 'module_mixlab',
  MODULE_DISCOUNTS: 'module_discounts',
  MODULE_CATEGORIES: 'module_categories',
  MODULE_NOTES: 'module_notes',
  MODULE_ADVISOR: 'module_advisor',
  MODULE_SHIFT: 'module_shift',
  MODULE_SETTINGS: 'module_settings',

  // Special Actions
  VIEW_PROFIT: 'view_profit',
  DELETE_INVOICE: 'delete_invoice',
  MANAGE_USERS: 'manage_users',
  PURGE_DATA: 'purge_data',
  APPLY_DISCOUNT: 'apply_discount',
  CHANGE_PRICE: 'change_price'
};

export const useAuthStore = create((set, get) => ({
  currentUser: DEFAULT_MANAGER,
  usersList: [],
  isPinModalOpen: false,
  pinError: null,
  loading: false,

  // Load all users from SQLite
  loadUsers: async () => {
    set({ loading: true });
    try {
      const users = await usersRepo.getAllUsersWithPermissions();
      set({ usersList: users, loading: false });
      return users;
    } catch (err) {
      console.error('Failed to load users:', err);
      set({ loading: false });
      return [];
    }
  },

  // Authenticate user with PIN
  loginWithPin: async (pin) => {
    set({ loading: true, pinError: null });
    try {
      const user = await usersRepo.authenticatePin(pin);
      if (user) {
        set({ currentUser: user, isPinModalOpen: false, pinError: null, loading: false });
        return { success: true, user };
      } else {
        set({ pinError: 'رمز PIN غير صحيح', loading: false });
        return { success: false, error: 'رمز PIN غير صحيح' };
      }
    } catch (err) {
      set({ pinError: err.message, loading: false });
      return { success: false, error: err.message };
    }
  },

  // Switch active user directly
  switchUser: (user) => {
    set({ currentUser: user });
  },

  // Check if current user has permission
  hasPermission: (permissionKey) => {
    const { currentUser } = get();
    if (!currentUser) return false;
    if (currentUser.role === 'manager') return true;
    if (currentUser.permissions && currentUser.permissions[permissionKey] !== undefined) {
      return Boolean(currentUser.permissions[permissionKey]);
    }
    // Default fallback for cashiers
    if (currentUser.role === 'cashier') {
      const allowedCashierModules = ['module_pos', 'module_online', 'module_returns', 'module_shift'];
      if (allowedCashierModules.includes(permissionKey)) return true;
      return false;
    }
    return true;
  },

  // Check module access permission
  canAccessModule: (moduleId) => {
    const permKey = `module_${moduleId}`;
    return get().hasPermission(permKey);
  },

  // Modal controls
  openPinModal: () => set({ isPinModalOpen: true, pinError: null }),
  closePinModal: () => set({ isPinModalOpen: false, pinError: null })
}));
