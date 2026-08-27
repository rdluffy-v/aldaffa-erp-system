/**
 * Authentication & Role-Based Permissions Store
 * Manages active user session, PIN authentication, screen locking, and granular access control
 */

import { create } from 'zustand';
import { UsersRepository, ROLE_PRESETS } from '../database/repositories/UsersRepository.js';

const usersRepo = new UsersRepository();

export const DEFAULT_MANAGER = {
  id: 'admin_1',
  name: 'المدير العام',
  role: 'manager',
  pin: '1234',
  permissions: ROLE_PRESETS.manager?.permissions || ROLE_PRESETS.manager
};

export const PERMISSION_KEYS = {
  // Modules Access (21 Modules)
  MODULE_DASHBOARD: 'module_dashboard',
  MODULE_ANALYTICS: 'module_analytics',
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
  CHANGE_PRICE: 'change_price',
  EDIT_SETTINGS: 'edit_settings'
};

export const useAuthStore = create((set, get) => ({
  currentUser: DEFAULT_MANAGER,
  usersList: [],
  isLocked: false,
  isPinModalOpen: false,
  isSwitchModalOpen: false,
  pinError: null,
  loading: false,

  // Load all users from SQLite
  loadUsers: async () => {
    set({ loading: true });
    try {
      const users = await usersRepo.getAllUsersWithPermissions();
      set({ usersList: users, loading: false });

      // If active currentUser is default manager or exists in list, refresh its permissions
      const active = get().currentUser;
      if (active) {
        const found = users.find((u) => u.id === active.id);
        if (found) {
          set({ currentUser: found });
        }
      }
      return users;
    } catch (err) {
      console.error('Failed to load users:', err);
      set({ loading: false });
      return [];
    }
  },

  // Lock Application
  lockApp: () => {
    set({ isLocked: true, pinError: null });
  },

  // Unlock Application with PIN
  unlockApp: async (pin) => {
    set({ loading: true, pinError: null });
    try {
      const cleanPin = String(pin || '').trim();
      const user = await usersRepo.authenticatePin(cleanPin);
      if (user) {
        set({ currentUser: user, isLocked: false, pinError: null, loading: false });
        return { success: true, user };
      } else {
        const errorMsg = 'رمز PIN غير صحيح';
        set({ pinError: errorMsg, loading: false });
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      set({ pinError: err.message, loading: false });
      return { success: false, error: err.message };
    }
  },

  // Quick switch active user with PIN verification
  quickSwitchUser: async (targetUser, pin) => {
    set({ loading: true, pinError: null });
    try {
      const cleanPin = String(pin || '').trim();
      if (targetUser && targetUser.pin === cleanPin) {
        const fullUser = await usersRepo.authenticatePin(cleanPin);
        if (fullUser) {
          set({
            currentUser: fullUser,
            isLocked: false,
            isSwitchModalOpen: false,
            isPinModalOpen: false,
            pinError: null,
            loading: false
          });
          return { success: true, user: fullUser };
        }
      }

      // Try general PIN auth if user object wasn't supplied directly
      const user = await usersRepo.authenticatePin(cleanPin);
      if (user) {
        set({
          currentUser: user,
          isLocked: false,
          isSwitchModalOpen: false,
          isPinModalOpen: false,
          pinError: null,
          loading: false
        });
        return { success: true, user };
      } else {
        set({ pinError: 'رمز PIN غير صحيح للموظف المحدد', loading: false });
        return { success: false, error: 'رمز PIN غير صحيح للموظف المحدد' };
      }
    } catch (err) {
      set({ pinError: err.message, loading: false });
      return { success: false, error: err.message };
    }
  },

  // Direct login with PIN
  loginWithPin: async (pin) => {
    return await get().unlockApp(pin);
  },

  // Switch active user directly (internal use after validation)
  switchUser: (user) => {
    set({ currentUser: user, isLocked: false });
  },

  // Check if current user has permission for a specific key
  hasPermission: (permissionKey) => {
    const { currentUser } = get();
    if (!currentUser) return false;
    if (currentUser.role === 'manager') return true;

    if (currentUser.permissions && currentUser.permissions[permissionKey] !== undefined) {
      return Boolean(currentUser.permissions[permissionKey]);
    }

    // Role preset fallback
    const rolePreset = ROLE_PRESETS[currentUser.role]?.permissions || ROLE_PRESETS[currentUser.role];
    if (rolePreset && rolePreset[permissionKey] !== undefined) {
      return Boolean(rolePreset[permissionKey]);
    }

    // Default fallback for cashiers
    if (currentUser.role === 'cashier') {
      const allowedCashierModules = [
        PERMISSION_KEYS.MODULE_POS,
        PERMISSION_KEYS.MODULE_ONLINE,
        PERMISSION_KEYS.MODULE_RETURNS,
        PERMISSION_KEYS.MODULE_BARCODES,
        PERMISSION_KEYS.MODULE_SHIFT
      ];
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
  closePinModal: () => set({ isPinModalOpen: false, pinError: null }),
  openSwitchModal: () => set({ isSwitchModalOpen: true, pinError: null }),
  closeSwitchModal: () => set({ isSwitchModalOpen: false, pinError: null })
}));

