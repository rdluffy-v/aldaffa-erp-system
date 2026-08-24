/**
 * Sales Repository
 * Handles all sales and sale_items database operations
 */

import { BaseRepository } from './BaseRepository.js';
import { db } from '../connection.js';
import { safeParseFloat } from '../../utils/helpers.js';

export class SalesRepository extends BaseRepository {
  constructor() {
    super('sales');
  }

  /**
   * Create sale with items in transaction
   */
  async createSaleWithItems(saleData, items) {
    // Check if sandbox mode is active to tag trial sales with is_demo = 1
    let isDemo = saleData.is_demo !== undefined ? saleData.is_demo : 0;
    if (!isDemo) {
      try {
        const setting = await db.get("SELECT value FROM settings WHERE key = 'sandbox_mode'");
        if (setting && setting.value === '1') isDemo = 1;
      } catch (e) {}
    }

    const masterPayload = { ...saleData, is_demo: isDemo };

    // 1. Insert sale master record first to get auto-incremented saleId
    const saleResult = await this.create(masterPayload);
    const saleId = saleResult?.lastInsertRowid;

    if (!saleId) {
      throw new Error('Failed to generate valid sale_id for new sale');
    }

    const queries = [];

    // 2. Insert sale items linked with sale_id
    for (const item of items) {
      const itemToInsert = {
        sale_id: saleId,
        product_id: String(item.product_id),
        name: item.name || 'منتج',
        cart_qty: safeParseFloat(item.cart_qty, 1),
        unit: item.unit || 'قطعة',
        final_price: safeParseFloat(item.final_price, 0),
        unit_cost: safeParseFloat(item.unit_cost, 0),
        portion_ml: item.portion_ml || null,
        is_demo: isDemo
      };

      const itemKeys = Object.keys(itemToInsert);
      const itemPlaceholders = itemKeys.map(() => '?').join(', ');
      queries.push({
        sql: `INSERT INTO sale_items (${itemKeys.join(', ')}) VALUES (${itemPlaceholders})`,
        params: Object.values(itemToInsert)
      });

      // 3. Deduct stock from inventory
      const qtyToDeduct = item.portion_ml
        ? (item.cart_qty * item.portion_ml / (item.capacity || 1))
        : item.cart_qty;

      queries.push({
        sql: 'UPDATE inventory SET qty = qty - ? WHERE id = ?',
        params: [qtyToDeduct, item.product_id]
      });
    }

    if (queries.length > 0) {
      await db.transaction(queries);
    }

    // Return array matching existing caller contract
    return [{ lastInsertRowid: saleId }, saleResult];
  }

  /**
   * Delete sale with automatic stock restoration, debtor balance recalculation, and related records cleanup
   */
  async deleteSaleWithStockRestore(saleId) {
    const sale = await this.findById(saleId);
    if (!sale) {
      throw new Error(`الفاتورة رقم #${saleId} غير موجودة`);
    }

    // 1. Fetch sale items to restore stock
    const items = await db.query('SELECT * FROM sale_items WHERE sale_id = ?', [saleId]);
    const queries = [];

    // 2. Restore stock for each item
    for (const item of (items || [])) {
      const qtyToRestore = item.portion_ml
        ? (item.cart_qty * item.portion_ml / (item.capacity || 1))
        : item.cart_qty;

      queries.push({
        sql: 'UPDATE inventory SET qty = qty + ? WHERE id = ?',
        params: [qtyToRestore, item.product_id]
      });
    }

    // 3. Delete sale items
    queries.push({
      sql: 'DELETE FROM sale_items WHERE sale_id = ?',
      params: [saleId]
    });

    // 4. Delete linked returns if any
    queries.push({
      sql: 'DELETE FROM returns WHERE sale_id = ?',
      params: [saleId]
    });

    // 5. If it was a debt sale or linked to debtor, adjust debtor balance and delete debt history
    if (sale.debtor_id) {
      queries.push({
        sql: 'UPDATE debtors SET total_debt = MAX(0, total_debt - ?) WHERE id = ?',
        params: [sale.total || 0, sale.debtor_id]
      });
      queries.push({
        sql: 'DELETE FROM debt_history WHERE invoice_id = ?',
        params: [saleId]
      });
    }

    // 6. Delete sale master record
    queries.push({
      sql: 'DELETE FROM sales WHERE id = ?',
      params: [saleId]
    });

    await db.transaction(queries);
    db.invalidateCache();
    return { success: true };
  }

  /**
   * Get sale with items
   */
  async getSaleWithItems(saleId) {
    const sale = await this.findById(saleId);
    if (!sale) return null;

    const items = await db.query(
      'SELECT * FROM sale_items WHERE sale_id = ?',
      [saleId]
    );

    return { ...sale, items };
  }

  /**
   * Get sales in date range
   */
  async getSalesInRange(startDate, endDate) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE date >= ? AND date <= ?
      ORDER BY date DESC
    `;
    return await db.query(sql, [startDate, endDate]);
  }

  /**
   * Get sales summary
   */
  async getSalesSummary(startDate, endDate) {
    const sql = `
      SELECT
        COUNT(*) as total_sales,
        SUM(total) as total_revenue,
        SUM(profit) as total_profit,
        SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END) as cash_sales,
        SUM(CASE WHEN payment_method = 'card' THEN total ELSE 0 END) as card_sales,
        SUM(CASE WHEN payment_method = 'bank_transfer' THEN total ELSE 0 END) as transfer_sales
      FROM ${this.tableName}
      WHERE date >= ? AND date <= ?
    `;
    return await db.get(sql, [startDate, endDate]);
  }

  /**
   * Get top selling products
   */
  async getTopSellingProducts(limit = 10, startDate = null, endDate = null) {
    let sql = `
      SELECT
        si.product_id,
        si.name,
        SUM(si.cart_qty) as total_qty,
        SUM(si.cart_qty * si.final_price) as total_revenue,
        SUM(si.cart_qty * (si.final_price - si.unit_cost)) as total_profit
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
    `;

    const params = [];
    if (startDate && endDate) {
      sql += ' WHERE s.date >= ? AND s.date <= ?';
      params.push(startDate, endDate);
    }

    sql += `
      GROUP BY si.product_id, si.name
      ORDER BY total_qty DESC
      LIMIT ?
    `;
    params.push(limit);

    return await db.query(sql, params);
  }

  /**
   * Get sales by payment method
   */
  async getSalesByPaymentMethod(startDate, endDate) {
    const sql = `
      SELECT
        payment_method,
        COUNT(*) as count,
        SUM(total) as total_amount
      FROM ${this.tableName}
      WHERE date >= ? AND date <= ?
      GROUP BY payment_method
    `;
    return await db.query(sql, [startDate, endDate]);
  }
}
