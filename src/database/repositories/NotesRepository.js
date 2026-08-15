/**
 * Notes Repository
 * Handles notes, tasks, and prefixed business records (FORMULA:, DISCOUNT:)
 */

import { BaseRepository } from './BaseRepository.js';
import { db } from '../connection.js';

export class NotesRepository extends BaseRepository {
  constructor() {
    super('notes');
  }

  /**
   * Get notes by priority
   * @param {string} priority - 'low' | 'normal' | 'high' | 'urgent'
   */
  async getByPriority(priority) {
    return await this.findAll({ priority }, 'date DESC');
  }

  /**
   * Get notes whose title starts with a prefix (e.g. 'FORMULA:', 'DISCOUNT:')
   */
  async getByTitlePrefix(prefix) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE title LIKE ?
      ORDER BY date DESC
    `;
    return await db.query(sql, [`${prefix}%`]);
  }

  /**
   * Get note by exact title
   */
  async getByTitle(title) {
    return await this.findOne({ title });
  }

  /**
   * Search notes by title, content, or author
   */
  async searchNotes(term) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE title LIKE ? OR content LIKE ? OR author LIKE ?
      ORDER BY date DESC
    `;
    const searchTerm = `%${term}%`;
    return await db.query(sql, [searchTerm, searchTerm, searchTerm]);
  }

  /**
   * Get priority counts summary
   */
  async getPrioritySummary() {
    const sql = `
      SELECT priority, COUNT(*) as count
      FROM ${this.tableName}
      GROUP BY priority
    `;
    return await db.query(sql);
  }
}
