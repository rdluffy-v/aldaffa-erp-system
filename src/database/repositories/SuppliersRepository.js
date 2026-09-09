/**
 * Suppliers Repository
 * Manages suppliers and supplier profiles for purchase orders
 */

import { BaseRepository } from './BaseRepository.js';
import { db } from '../connection.js';

export class SuppliersRepository extends BaseRepository {
  constructor() {
    super('suppliers');
  }

  /**
   * Find a supplier by exact name
   */
  async findByName(name) {
    if (!name) return null;
    return await this.findOne({ name: name.trim() });
  }

  /**
   * Search suppliers by name or phone or company
   */
  async searchSuppliers(term) {
    if (!term || !term.trim()) {
      return await this.findAll({}, 'name ASC');
    }
    const clean = `%${term.trim()}%`;
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE name LIKE ? OR phone LIKE ? OR company LIKE ?
      ORDER BY name ASC
    `;
    return await db.query(sql, [clean, clean, clean]);
  }

  /**
   * Get all suppliers with total purchases and invoices count
   */
  async getSuppliersWithStats() {
    const sql = `
      SELECT 
        s.*,
        COUNT(p.id) as total_invoices,
        COALESCE(SUM(p.total), 0) as total_purchased_amount,
        MAX(p.date) as last_purchase_date
      FROM ${this.tableName} s
      LEFT JOIN purchases p ON p.supplier_name = s.name
      GROUP BY s.id, s.name
      ORDER BY s.name ASC
    `;
    return await db.query(sql);
  }
}
