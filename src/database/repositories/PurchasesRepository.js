/**
 * Purchases Repository
 * Handles purchase orders and supplier transactions
 */

import { BaseRepository } from './BaseRepository.js';
import { db } from '../connection.js';

export class PurchasesRepository extends BaseRepository {
  constructor() {
    super('purchases');
  }

  /**
   * Create purchase with inventory update
   */
  async createPurchaseWithInventoryUpdate(purchaseData, items, inventoryRepo) {
    const queries = [];

    // Insert purchase
    const keys = Object.keys(purchaseData);
    const placeholders = keys.map(() => '?').join(', ');
    queries.push({
      sql: `INSERT INTO ${this.tableName} (${keys.join(', ')}) VALUES (${placeholders})`,
      params: Object.values(purchaseData)
    });

    // Update inventory with WAC for each item
    for (const item of items) {
      queries.push({
        sql: `
          UPDATE inventory
          SET
            qty = qty + ?,
            cost = (qty * cost + ? * ?) / (qty + ?)
          WHERE id = ?
        `,
        params: [
          item.quantity,
          item.quantity,
          item.cost_per_unit,
          item.quantity,
          item.product_id
        ]
      });
    }

    await db.transaction(queries);
  }

  /**
   * Get purchases in date range
   */
  async getPurchasesInRange(startDate, endDate) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE date >= ? AND date <= ?
      ORDER BY date DESC
    `;
    return await db.query(sql, [startDate, endDate]);
  }

  /**
   * Get purchases by supplier
   */
  async getBySupplier(supplierName) {
    return await this.findAll({ supplier_name: supplierName }, 'date DESC');
  }

  /**
   * Get purchase summary
   */
  async getPurchaseSummary(startDate, endDate) {
    const sql = `
      SELECT
        COUNT(*) as total_purchases,
        SUM(total) as total_amount,
        COUNT(DISTINCT supplier_name) as unique_suppliers
      FROM ${this.tableName}
      WHERE date >= ? AND date <= ?
    `;
    return await db.get(sql, [startDate, endDate]);
  }
}
