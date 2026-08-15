/**
 * Settings Repository
 * Handles key/value application settings (e.g. gemini_api_key)
 *
 * NOTE: the settings table uses `key` as its primary key, so this repository
 * overrides the BaseRepository update path with a proper UPSERT.
 */

import { BaseRepository } from './BaseRepository.js';
import { db } from '../connection.js';

export class SettingsRepository extends BaseRepository {
  constructor() {
    super('settings');
  }

  /**
   * Get a setting value by key
   */
  async getSetting(key) {
    const row = await this.findOne({ key });
    return row ? row.value : null;
  }

  /**
   * Set a setting value (insert or update)
   */
  async setSetting(key, value) {
    const sql = `
      INSERT INTO ${this.tableName} (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `;
    await db.run(sql, [key, value]);
    return await this.getSetting(key);
  }

  /**
   * Set a setting only if it does not already exist
   */
  async setSettingIfAbsent(key, value) {
    const existing = await this.getSetting(key);
    if (existing !== null) return existing;
    await this.setSetting(key, value);
    return value;
  }

  /**
   * Delete a setting by key
   */
  async deleteSetting(key) {
    const sql = `DELETE FROM ${this.tableName} WHERE key = ?`;
    await db.run(sql, [key]);
    return true;
  }

  /**
   * Get all settings
   */
  async getAllSettings() {
    return await this.findAll({}, 'key ASC');
  }
}
