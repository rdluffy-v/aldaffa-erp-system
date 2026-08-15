/**
 * Gifts Repository
 * Handles gift and sample distribution records
 */

import { BaseRepository } from './BaseRepository.js';
import { db } from '../connection.js';

export class GiftsRepository extends BaseRepository {
  constructor() {
    super('gifts');
  }

  /**
   * Create gift and deduct from inventory
   */
  async createGiftWithInventoryDeduction(giftData) {
    const queries = [];

    // Insert gift record
    const giftKeys = Object.keys(giftData);
    const giftPlaceholders = giftKeys.map(() => '?').join(', ');
    queries.push({
      sql: `INSERT INTO ${this.tableName} (${giftKeys.join(', ')}) VALUES (${giftPlaceholders})`,
      params: Object.values(giftData)
    });

    // Deduct from inventory
    queries.push({
      sql: 'UPDATE inventory SET qty = qty - ? WHERE id = ?',
      params: [giftData.qty, giftData.product_id]
    });

    await db.transaction(queries);
  }

  /**
   * Delete gift and restore inventory
   */
  async deleteGiftWithInventoryRestore(giftId) {
    const gift = await this.findById(giftId);
    if (!gift) throw new Error('Gift not found');

    const queries = [];

    // Restore inventory
    queries.push({
      sql: 'UPDATE inventory SET qty = qty + ? WHERE id = ?',
      params: [gift.qty, gift.product_id]
    });

    // Delete gift
    queries.push({
      sql: `DELETE FROM ${this.tableName} WHERE id = ?`,
      params: [giftId]
    });

    await db.transaction(queries);
  }

  /**
   * Get gifts in date range
   */
  async getGiftsInRange(startDate, endDate) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE date >= ? AND date <= ?
      ORDER BY date DESC
    `;
    return await db.query(sql, [startDate, endDate]);
  }

  /**
   * Get gifts summary
   */
  async getGiftsSummary(startDate, endDate) {
    const sql = `
      SELECT
        COUNT(*) as total_gifts,
        SUM(cost_value) as total_cost,
        COUNT(DISTINCT recipient_name) as unique_recipients,
        COUNT(DISTINCT product_id) as unique_products
      FROM ${this.tableName}
      WHERE date >= ? AND date <= ?
    `;
    return await db.get(sql, [startDate, endDate]);
  }

  /**
   * Get gifts by recipient
   */
  async getGiftsByRecipient(recipientName) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE recipient_name = ?
      ORDER BY date DESC
    `;
    return await db.query(sql, [recipientName]);
  }

  /**
   * Get all recipients
   */
  async getRecipients() {
    const sql = `
      SELECT DISTINCT recipient_name, recipient_phone, COUNT(*) as gift_count, SUM(cost_value) as total_cost
      FROM ${this.tableName}
      WHERE recipient_name IS NOT NULL AND recipient_name != ''
      GROUP BY recipient_name, recipient_phone
      ORDER BY gift_count DESC
    `;
    return await db.query(sql);
  }

  /**
   * Get gifts by product
   */
  async getGiftsByProduct(productId) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE product_id = ?
      ORDER BY date DESC
    `;
    return await db.query(sql, [productId]);
  }

  /**
   * Search gifts
   */
  async searchGifts(term) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE recipient_name LIKE ? OR item_name LIKE ? OR reason LIKE ?
      ORDER BY date DESC
    `;
    const searchTerm = `%${term}%`;
    return await db.query(sql, [searchTerm, searchTerm, searchTerm]);
  }

  /**
   * Get monthly gift totals
   */
  async getMonthlyTotals(year) {
    const sql = `
      SELECT
        strftime('%m', date) as month,
        COUNT(*) as count,
        SUM(cost_value) as total_cost
      FROM ${this.tableName}
      WHERE strftime('%Y', date) = ?
      GROUP BY month
      ORDER BY month
    `;
    return await db.query(sql, [year.toString()]);
  }
}
