/**
 * Users & Permissions Repository
 * Manages staff accounts, PIN authentication, role assignment, and granular feature permissions
 */

import { BaseRepository } from './BaseRepository.js';
import { db } from '../connection.js';

export class UsersRepository extends BaseRepository {
  constructor() {
    super('users');
  }

  /**
   * Verify PIN code and authenticate user
   */
  async authenticatePin(pin) {
    const cleanPin = String(pin || '').trim();
    const sql = `SELECT * FROM ${this.tableName} WHERE pin = ? LIMIT 1`;
    const user = await db.get(sql, [cleanPin]);
    if (!user) return null;

    const permissions = await this.getUserPermissions(user.id);
    return { ...user, permissions };
  }

  /**
   * Get all users with their permissions
   */
  async getAllUsersWithPermissions() {
    const users = await this.findAll({}, 'name ASC');
    const result = [];
    for (const u of users) {
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
    if (id) {
      await this.update(id, { name, pin: String(pin).trim(), role, avatar });
      if (permissionsMap && Object.keys(permissionsMap).length > 0) {
        await this.setUserPermissions(id, permissionsMap);
      }
      return await this.findById(id);
    } else {
      const newId = 'usr_' + Date.now().toString(36);
      await this.create({
        id: newId,
        name,
        pin: String(pin).trim(),
        role: role || 'cashier',
        avatar: avatar || null,
        created_at: new Date().toISOString()
      });
      if (permissionsMap && Object.keys(permissionsMap).length > 0) {
        await this.setUserPermissions(newId, permissionsMap);
      }
      return await this.findById(newId);
    }
  }

  /**
   * Delete User and their associated permissions
   */
  async deleteUser(userId) {
    const delPerms = `DELETE FROM user_permissions WHERE user_id = ?`;
    await db.run(delPerms, [userId]);
    await this.delete(userId);
    return true;
  }
}
