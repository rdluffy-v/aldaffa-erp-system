/**
 * Users & Permissions Repository
 * Manages staff accounts, PIN authentication, role assignment, and granular feature permissions
 */

import { BaseRepository } from './BaseRepository.js';
import { db } from '../connection.js';

export const ROLE_PRESETS = {
  manager: {
    permissions: {
      // All 21 modules
      module_dashboard: true,
      module_analytics: true,
      module_pos: true,
      module_online: true,
      module_returns: true,
      module_invoices: true,
      module_debtors: true,
      module_inventory: true,
      module_purchases: true,
      module_barcodes: true,
      module_withdrawals: true,
      module_capital: true,
      module_gifts: true,
      module_losses: true,
      module_mixlab: true,
      module_discounts: true,
      module_categories: true,
      module_notes: true,
      module_advisor: true,
      module_shift: true,
      module_settings: true,
      // Special Actions
      view_profit: true,
      delete_invoice: true,
      manage_users: true,
      purge_data: true,
      apply_discount: true,
      change_price: true,
      edit_settings: true
    }
  },
  accountant: {
    permissions: {
      // Modules
      module_dashboard: true,
      module_analytics: true,
      module_pos: false,
      module_online: false,
      module_returns: false,
      module_invoices: true,
      module_debtors: true,
      module_inventory: true,
      module_purchases: true,
      module_barcodes: false,
      module_withdrawals: true,
      module_capital: true,
      module_gifts: false,
      module_losses: true,
      module_mixlab: false,
      module_discounts: true,
      module_categories: true,
      module_notes: true,
      module_advisor: true,
      module_shift: true,
      module_settings: false,
      // Special Actions
      view_profit: true,
      delete_invoice: false,
      manage_users: false,
      purge_data: false,
      apply_discount: false,
      change_price: false,
      edit_settings: false
    }
  },
  cashier: {
    permissions: {
      // Modules
      module_dashboard: false,
      module_analytics: false,
      module_pos: true,
      module_online: true,
      module_returns: true,
      module_invoices: false,
      module_debtors: false,
      module_inventory: false,
      module_purchases: false,
      module_barcodes: true,
      module_withdrawals: false,
      module_capital: false,
      module_gifts: false,
      module_losses: false,
      module_mixlab: false,
      module_discounts: false,
      module_categories: false,
      module_notes: false,
      module_advisor: false,
      module_shift: true,
      module_settings: false,
      // Special Actions
      view_profit: false,
      delete_invoice: false,
      manage_users: false,
      purge_data: false,
      apply_discount: false,
      change_price: false,
      edit_settings: false
    }
  }
};

export const DEFAULT_USERS = [
  { id: 'admin_1', name: 'المدير العام', pin: '1234', role: 'manager' },
  { id: 'usr_accountant', name: 'المحاسب', pin: '5678', role: 'accountant' },
  { id: 'usr_cashier', name: 'الكاشير المناوب', pin: '0000', role: 'cashier' }
];

export class UsersRepository extends BaseRepository {
  constructor() {
    super('users');
  }

  /**
   * Seed default 3 roles if users table is empty or missing them
   */
  async seedDefaultUsers() {
    try {
      for (const defUser of DEFAULT_USERS) {
        const existing = await db.get(`SELECT id FROM ${this.tableName} WHERE id = ? OR pin = ?`, [defUser.id, defUser.pin]);
        if (!existing) {
          await this.create({
            id: defUser.id,
            name: defUser.name,
            pin: defUser.pin,
            role: defUser.role,
            avatar: null,
            created_at: new Date().toISOString()
          });
          const presetPerms = ROLE_PRESETS[defUser.role]?.permissions || ROLE_PRESETS[defUser.role] || {};
          await this.setUserPermissions(defUser.id, presetPerms);
        }
      }
    } catch (err) {
      console.error('Failed to seed default users:', err);
    }
  }

  /**
   * Verify PIN code and authenticate user
   */
  async authenticatePin(pin) {
    const cleanPin = String(pin || '').trim();
    if (!cleanPin) return null;

    // Check if seeding is needed
    const countRow = await db.get(`SELECT COUNT(*) as count FROM ${this.tableName}`);
    if (!countRow || countRow.count === 0) {
      await this.seedDefaultUsers();
    }

    const sql = `SELECT * FROM ${this.tableName} WHERE pin = ? LIMIT 1`;
    const user = await db.get(sql, [cleanPin]);
    if (!user) return null;

    const permissions = await this.getUserPermissions(user.id);
    return { ...user, permissions };
  }

  /**
   * Check if a PIN code is available (not used by other users)
   */
  async checkPinAvailability(pin, excludeUserId = null) {
    const cleanPin = String(pin || '').trim();
    if (!cleanPin) return false;
    let sql = `SELECT id FROM ${this.tableName} WHERE pin = ?`;
    const params = [cleanPin];
    if (excludeUserId) {
      sql += ' AND id != ?';
      params.push(excludeUserId);
    }
    sql += ' LIMIT 1';
    const existing = await db.get(sql, params);
    return !existing;
  }

  /**
   * Get all users with their permissions
   */
  async getAllUsersWithPermissions() {
    let users = await this.findAll({}, 'name ASC');
    if (!users || users.length === 0) {
      await this.seedDefaultUsers();
      users = await this.findAll({}, 'name ASC');
    }

    const result = [];
    for (const u of (users || [])) {
      const perms = await this.getUserPermissions(u.id);
      result.push({ ...u, permissions: perms });
    }
    return result;
  }

  /**
   * Get permissions dict for a specific user
   */
  async getUserPermissions(userId) {
    const sql = `SELECT permission_key, is_allowed FROM user_permissions WHERE user_id = ?`;
    const rows = await db.query(sql, [userId]);
    const permMap = {};
    if (Array.isArray(rows)) {
      rows.forEach((r) => {
        permMap[r.permission_key] = Boolean(r.is_allowed);
      });
    }
    return permMap;
  }

  /**
   * Save permissions for a user
   */
  async setUserPermissions(userId, permissionsMap) {
    const queries = Object.keys(permissionsMap).map((key) => ({
      sql: `INSERT INTO user_permissions (user_id, permission_key, is_allowed) VALUES (?, ?, ?)
            ON CONFLICT(user_id, permission_key) DO UPDATE SET is_allowed = excluded.is_allowed`,
      params: [userId, key, permissionsMap[key] ? 1 : 0]
    }));
    if (queries.length > 0) {
      await db.transaction(queries);
    }
    return true;
  }

  /**
   * Create or Update User with PIN and Role
   */
  async saveUser(userData, permissionsMap = {}) {
    const { id, name, pin, role, avatar } = userData;
    const cleanPin = String(pin).trim();

    // Check PIN availability
    const isAvailable = await this.checkPinAvailability(cleanPin, id);
    if (!isAvailable) {
      throw new Error(`رمز PIN (${cleanPin}) مستخدم بالفعل من قبل موظف آخر. يرجى اختيار رمز مختلف.`);
    }

    if (id) {
      await this.update(id, { name, pin: cleanPin, role, avatar });
      const permsToSave = (permissionsMap && Object.keys(permissionsMap).length > 0)
        ? permissionsMap
        : (ROLE_PRESETS[role] || {});
      await this.setUserPermissions(id, permsToSave);
      return await this.findById(id);
    } else {
      const newId = 'usr_' + Date.now().toString(36);
      await this.create({
        id: newId,
        name,
        pin: cleanPin,
        role: role || 'cashier',
        avatar: avatar || null,
        created_at: new Date().toISOString()
      });
      const permsToSave = (permissionsMap && Object.keys(permissionsMap).length > 0)
        ? permissionsMap
        : (ROLE_PRESETS[role || 'cashier'] || {});
      await this.setUserPermissions(newId, permsToSave);
      return await this.findById(newId);
    }
  }

  /**
   * Delete User and their associated permissions with sole manager check
   */
  async deleteUser(userId) {
    const user = await this.findById(userId);
    if (!user) {
      throw new Error('المستخدم المراد حذفه غير موجود');
    }

    if (user.role === 'manager') {
      const allUsers = await this.findAll({ role: 'manager' });
      if (!allUsers || allUsers.length <= 1) {
        throw new Error('لا يمكن حذف حساب المدير العام الوحيد المتبقي في المنظومة');
      }
    }

    const delPerms = `DELETE FROM user_permissions WHERE user_id = ?`;
    await db.run(delPerms, [userId]);
    await this.delete(userId);
    return { success: true };
  }
}


