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
    // 1. Insert sale master record first to get auto-incremented saleId
    const saleResult = await this.create(saleData);
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
        portion_ml: item.portion_ml || null
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
