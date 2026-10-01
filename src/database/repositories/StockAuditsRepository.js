/**
 * Stock Audits Repository
 * Records every addition, modification, price adjustment, restock, and deletion
 * in inventory with timestamp, action type, user, and quantities.
 */

import { BaseRepository } from './BaseRepository.js';
import { db } from '../connection.js';
import { generateId, safeParseFloat } from '../../utils/helpers.js';

export class StockAuditsRepository extends BaseRepository {
  constructor() {
    super('stock_audits');
  }

  /**
   * Log an inventory action
   */
  async logAction({
    productId = '',
    productName = '',
    actionType = 'update', // 'create' | 'update' | 'restock' | 'delete' | 'batch_price_update' | 'inventory_count'
    oldQty = 0,
    newQty = 0,
    qtyDelta = 0,
    oldPrice = 0,
    newPrice = 0,
    notes = '',
    userName = 'النظام',
    date = null
  }) {
    const timestamp = new Date().toISOString();
    const actionDate = date || timestamp;
    const id = generateId();

    const record = {
      id,
      product_id: String(productId || ''),
      product_name: String(productName || ''),
      action_type: actionType,
      old_qty: safeParseFloat(oldQty),
      new_qty: safeParseFloat(newQty),
      qty_delta: safeParseFloat(qtyDelta),
      old_price: safeParseFloat(oldPrice),
      new_price: safeParseFloat(newPrice),
      notes: String(notes || ''),
      user_name: String(userName || 'المستخدم'),
      date: actionDate,
      created_at: timestamp,
      is_demo: 0
    };

    try {
      await this.create(record);
      return record;
    } catch (err) {
      console.warn('StockAuditsRepository: logAction error:', err.message);
      return null;
    }
  }

  /**
   * Query audits with filters, search, and date range
   */
  async getAudits(filters = {}) {
    let sql = `SELECT * FROM ${this.tableName}`;
    const conditions = [];
    const params = [];

    if (filters.startDate) {
      conditions.push('date >= ?');
      params.push(`${filters.startDate}T00:00:00.000Z`);
    }

    if (filters.endDate) {
      conditions.push('date <= ?');
      params.push(`${filters.endDate}T23:59:59.999Z`);
    }

    if (filters.productId) {
      conditions.push('product_id = ?');
      params.push(String(filters.productId));
    }

    if (filters.actionType && filters.actionType !== 'all') {
      conditions.push('action_type = ?');
      params.push(filters.actionType);
    }

    if (filters.search && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      conditions.push('(product_name LIKE ? OR notes LIKE ? OR user_name LIKE ?)');
      params.push(term, term, term);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ' ORDER BY date DESC, created_at DESC';

    if (filters.limit) {
      sql += ` LIMIT ${parseInt(filters.limit, 10)}`;
    }

    return await db.query(sql, params);
  }

  /**
   * Get audit history for a single product
   */
  async getProductHistory(productId) {
    if (!productId) return [];
    const sql = `SELECT * FROM ${this.tableName} WHERE product_id = ? ORDER BY date DESC, created_at DESC`;
    return await db.query(sql, [String(productId)]);
  }
}
