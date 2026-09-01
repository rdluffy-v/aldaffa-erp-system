/**
 * Users & Permissions Repository
 * Manages staff accounts, PIN authentication, role assignment, and granular feature permissions
 *
 * SECURITY: PINs are hashed with SHA-256 (Web Crypto API) before storage and
 * authentication. The database may still contain legacy plaintext PINs for
 * default users; a one-time migration detects and upgrades them automatically
 * on the first successful login after this change.
 */

import { BaseRepository } from './BaseRepository.js';
import { db } from '../connection.js';

// ---------------------------------------------------------------------------
// SHA-256 PIN hashing (Web Crypto API — available in all modern Electron
// renderer contexts regardless of nodeIntegration / contextIsolation)
// ---------------------------------------------------------------------------

/** Length of a SHA-256 hex digest (64 characters). */
const HASHED_PIN_LEN = 64;

export async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Returns true when candidate looks like a plaintext PIN (4-8 digits), not a SHA-256 hex. */
function isPlaintextPin(candidate) {
  return /^\d{4,8}$/.test(String(candidate || ''));
}

/** Returns true when candidate looks like a SHA-256 hex digest. */
function isHashedPin(candidate) {
  return /^[a-f0-9]{64}$/.test(String(candidate || ''));
}

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
  { id: 'admin_1', name: 'المدير العام', pinHash: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', role: 'manager' },
  { id: 'usr_accountant', name: 'المحاسب', pinHash: 'f8638b979b2f4f793ddb6dbd197e0ee25a7a6ea32b0ae22f5e3c5d119d839e75', role: 'accountant' },
  { id: 'usr_cashier', name: 'الكاشير المناوب', pinHash: '9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0', role: 'cashier' }
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
        const existing = await db.get(
          `SELECT id FROM ${this.tableName} WHERE id = ? OR pin = ? OR hashed_pin = ?`,
          [defUser.id, defUser.pinHash, defUser.pinHash]
        );
        if (!existing) {
          await this.create({
            id: defUser.id,
            name: defUser.name,
            pin: defUser.pinHash,
            hashed_pin: defUser.pinHash,
            role: defUser.role,
            avatar: null,
            created_at: new Date().toISOString()
          });
          const presetPerms = ROLE_PRESETS[defUser.role]?.permissions || {};
          await this.setUserPermissions(defUser.id, presetPerms);
        }
      }
    } catch (err) {
      console.error('Failed to seed default users:', err);
    }
  }

  /**
   * Verify PIN code and authenticate user.
   * Supports hashed PINs (SHA-256 in hashed_pin column) with automatic fallback to legacy
   * plaintext pin column for DBs that have not yet been migrated by main.cjs.
   * On legacy login, the row is atomically upgraded to hashed storage.
   */
  async authenticatePin(pin) {
    const cleanPin = String(pin || '').trim();
    if (!cleanPin) return null;

    // Check if seeding is needed
    const countRow = await db.get(`SELECT COUNT(*) as count FROM ${this.tableName}`);
    if (!countRow || countRow.count === 0) {
      await this.seedDefaultUsers();
    }

    // Try modern hashed-pin column first
    const hashed = await hashPin(cleanPin);
    const sql = `SELECT * FROM ${this.tableName} WHERE hashed_pin = ? LIMIT 1`;
    let user = await db.get(sql, [hashed]);

    // Fallback: legacy plaintext pin match (pre-migration databases)
    if (!user) {
      const legacySql = `SELECT * FROM ${this.tableName} WHERE pin = ? LIMIT 1`;
      user = await db.get(legacySql, [cleanPin]);
      if (user && isPlaintextPin(user.pin)) {
        // Auto-migrate this row: copy plaintext pin into hashed_pin
        try {
          await db.run(
            `UPDATE ${this.tableName} SET hashed_pin = ? WHERE id = ?`,
            [hashed, user.id]
          );
        } catch (migrateErr) {
          // Column may not exist yet — migration deferred to main.cjs
          console.warn('Auto-migrate hashed_pin column failed (deferred to main process):', migrateErr.message);
        }
      }
    }

    if (!user) return null;

    const permissions = await this.getUserPermissions(user.id);
    return { ...user, permissions };
  }

  /**
   * Check if a PIN code is available (not used by other users)
   * Checks both hashed_pin and legacy pin columns.
   */
  async checkPinAvailability(pin, excludeUserId = null) {
    const cleanPin = String(pin || '').trim();
    if (!cleanPin) return false;
    const hashed = await hashPin(cleanPin);
    let sql = `SELECT id FROM ${this.tableName} WHERE hashed_pin = ?`;
    const params = [hashed];
    if (excludeUserId) {
      sql += ' AND id != ?';
      params.push(excludeUserId);
    }
    sql += ' LIMIT 1';
    const existing = await db.get(sql, params);
    if (existing) return false;
    // Also check legacy plaintext pin column for safety
    let legacySql = `SELECT id FROM ${this.tableName} WHERE pin = ?`;
    const legacyParams = [cleanPin];
    if (excludeUserId) {
      legacySql += ' AND id != ?';
      legacyParams.push(excludeUserId);
    }
    legacySql += ' LIMIT 1';
    const legacyExisting = await db.get(legacySql, legacyParams);
    return !legacyExisting;
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
   * Create or Update User with PIN and Role.
   * Automatically hashes plaintext PINs before storage and upgrades existing
   * rows that still hold a legacy plaintext value in the pin column.
   */
  async saveUser(userData, permissionsMap = {}) {
    const { id, name, pin, role, avatar } = userData;
    const cleanPin = String(pin || '').trim();
    if (!cleanPin) throw new Error('رمز PIN مطلوب');

    // Hash the PIN regardless of whether it arrives plaintext or already-hashed
    const hashed = isHashedPin(cleanPin) ? cleanPin : await hashPin(cleanPin);

    // Check PIN availability against both hashed and legacy plaintext columns
    const isAvailable = await this.checkPinAvailability(cleanPin, id);
    if (!isAvailable) {
      throw new Error(`رمز PIN (${cleanPin}) مستخدم بالفعل من قبل موظف آخر. يرجى اختيار رمز مختلف.`);
    }

    if (id) {
      await this.update(id, { name, pin: hashed, hashed_pin: hashed, role, avatar });
      // Also upgrade legacy plaintext pin in the old column if present
      try {
        await db.run(`UPDATE ${this.tableName} SET pin = ? WHERE id = ? AND pin != ?`, [hashed, id, hashed]);
      } catch (e) { /* column may not exist; main.cjs handles schema migration */ }
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
        pin: hashed,
        hashed_pin: hashed,
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


