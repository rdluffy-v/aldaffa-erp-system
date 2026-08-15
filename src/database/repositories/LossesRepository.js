/**
 * Losses Repository
 * Handles loss/damage records with inventory deduction
 */

import { BaseRepository } from './BaseRepository.js';
import { db } from '../connection.js';

export class LossesRepository extends BaseRepository {
  constructor() {
    super('losses');
  }

  /**
   * Create a loss record and deduct from inventory in one transaction
   *
   * The `losses` table does not store a product_id column, so the product is
   * passed separately and used only for the inventory deduction.
   *
   * @param {Object} lossData - Loss row data (id, date, item_name, qty, unit, cost_value, reason)
   * @param {string} productId - Inventory product id to deduct from
   */
  async createLossWithInventoryDeduction(lossData, productId) {
    const queries = [];

    // Insert loss record
    const lossKeys = Object.keys(lossData);
    const lossPlaceholders = lossKeys.map(() => '?').join(', ');
    queries.push({
      sql: `INSERT INTO ${this.tableName} (${lossKeys.join(', ')}) VALUES (${lossPlaceholders})`,
      params: Object.values(lossData)
    });

    // Deduct from inventory
    queries.push({
      sql: 'UPDATE inventory SET qty = qty - ? WHERE id = ?',
      params: [lossData.qty, productId]
    });

    return await db.transaction(queries);
  }

  /**
   * Get losses in date range
   */
  async getLossesInRange(startDate, endDate) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE date >= ? AND date <= ?
      ORDER BY date DESC
    `;
    return await db.query(sql, [startDate, endDate]);
  }

  /**
   * Get losses summary
   */
  async getLossesSummary(startDate, endDate) {
    const sql = `
      SELECT
        COUNT(*) as total_losses,
        SUM(qty) as total_qty,
        SUM(cost_value) as total_cost,
        MAX(cost_value) as max_loss,
        COUNT(DISTINCT item_name) as unique_items
      FROM ${this.tableName}
      WHERE date >= ? AND date <= ?
    `;
    return await db.get(sql, [startDate, endDate]);
  }

  /**
   * Get losses by item name
   */
  async getLossesByItem(itemName) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE item_name = ?
      ORDER BY date DESC
    `;
    return await db.query(sql, [itemName]);
  }

  /**
   * Search losses
   */
  async searchLosses(term) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE item_name LIKE ? OR reason LIKE ?
      ORDER BY date DESC
    `;
    const searchTerm = `%${term}%`;
    return await db.query(sql, [searchTerm, searchTerm]);
  }

  /**
   * Get monthly loss totals
   */
  async getMonthlyTotals(year) {
    const sql = `
      SELECT
        strftime('%m', date) as month,
        COUNT(*) as count,
        SUM(qty) as total_qty,
        SUM(cost_value) as total_cost
      FROM ${this.tableName}
      WHERE strftime('%Y', date) = ?
      GROUP BY month
      ORDER BY month
    `;
    return await db.query(sql, [year.toString()]);
  }
}
