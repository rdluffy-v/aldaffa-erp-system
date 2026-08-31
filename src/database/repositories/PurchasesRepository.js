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
    let isDemo = purchaseData.is_demo !== undefined ? purchaseData.is_demo : 0;
    if (!isDemo) {
      try {
        const setting = await db.get("SELECT value FROM settings WHERE key = 'sandbox_mode'");
        if (setting && setting.value === '1') isDemo = 1;
      } catch (e) {}
    }

    const payload = { ...purchaseData, is_demo: isDemo };
    const queries = [];

    // Insert purchase
    const keys = Object.keys(payload);
    const placeholders = keys.map(() => '?').join(', ');
    queries.push({
      sql: `INSERT INTO ${this.tableName} (${keys.join(', ')}) VALUES (${placeholders})`,
      params: Object.values(payload)
    });

    // Update inventory with WAC for each item
    for (const item of items) {
      const q = Number(item.quantity) || 0;
      const c = Number(item.cost_per_unit) || 0;
      const pId = item.product_id;
      queries.push({
        sql: `
          UPDATE inventory
          SET
            cost = CASE
              WHEN (qty + ?) <= 0 THEN ?
              ELSE (qty * cost + ? * ?) / (qty + ?)
            END,
            qty = qty + ?
          WHERE id = ? OR CAST(id AS TEXT) = ?
        `,
        params: [
          q,
          c,
          q,
          c,
          q,
          q,
          pId,
          String(pId)
        ]
      });
    }

    await db.transaction(queries);
    db.invalidateCache();
  }

  /**
   * Delete purchase order and safely deduct stock from inventory
   */
  async deletePurchaseWithStockAdjustment(purchaseId) {
    const purchase = await this.findById(purchaseId);
    if (!purchase) {
      throw new Error(`فاتورة الشراء #${purchaseId} غير موجودة`);
    }

    let items = [];
    try {
      items = JSON.parse(purchase.items_json || '[]');
    } catch (e) {
      items = [];
    }

    const queries = [];

    // Safely deduct the purchased stock from inventory
    for (const item of items) {
      if (item.product_id && item.quantity) {
        queries.push({
          sql: 'UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?',
          params: [Number(item.quantity) || 0, item.product_id]
        });
      }
    }

    // Delete purchase record
    queries.push({
      sql: `DELETE FROM ${this.tableName} WHERE id = ?`,
      params: [purchaseId]
    });

    await db.transaction(queries);
    db.invalidateCache();
    return { success: true };
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
