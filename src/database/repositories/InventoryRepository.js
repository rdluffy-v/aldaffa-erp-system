/**
 * Inventory Repository
 * Handles all product/inventory database operations
 */

import { BaseRepository } from './BaseRepository.js';
import { db } from '../connection.js';

export class InventoryRepository extends BaseRepository {
  constructor() {
    super('inventory');
  }

  /**
   * Get all products with available stock
   */
  async getInStock() {
    return await this.findAll({ qty: '> 0' }, 'name ASC');
  }

  /**
   * Get low stock items (qty <= threshold)
   */
  async getLowStock(threshold = 10) {
    const sql = `SELECT * FROM ${this.tableName} WHERE qty <= ? ORDER BY qty ASC`;
    return await db.query(sql, [threshold]);
  }

  /**
   * Search products by name or barcode
   */
  async searchProducts(term) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE name LIKE ? OR barcode LIKE ?
      ORDER BY name ASC
    `;
    const searchTerm = `%${term}%`;
    return await db.query(sql, [searchTerm, searchTerm]);
  }

  /**
   * Get products by category
   */
  async getByCategory(categoryId) {
    return await this.findAll({ category: categoryId }, 'name ASC');
  }

  /**
   * Update stock quantity
   */
  async adjustStock(productId, quantityDelta) {
    const sql = `UPDATE ${this.tableName} SET qty = qty + ? WHERE id = ?`;
    await db.run(sql, [quantityDelta, productId]);
    return await this.findById(productId);
  }

  /**
   * Update cost with Weighted Average Cost calculation
   */
  async updateCostWithWAC(productId, newQty, newCost) {
    const product = await this.findById(productId);
    if (!product) throw new Error('Product not found');

    const totalQty = product.qty + newQty;
    const wac = totalQty === 0 ? newCost :
      (product.qty * product.cost + newQty * newCost) / totalQty;

    await db.run(
      `UPDATE ${this.tableName} SET qty = ?, cost = ? WHERE id = ?`,
      [totalQty, wac, productId]
    );

    return await this.findById(productId);
  }

  /**
   * Get total inventory value
   */
  async getTotalValue() {
    const sql = `SELECT SUM(qty * cost) as total_cost, SUM(qty * price) as total_retail FROM ${this.tableName}`;
    return await db.get(sql);
  }

  /**
   * Bulk update products
   */
  async bulkUpdate(updates) {
    const queries = updates.map(({ id, ...data }) => ({
      sql: `UPDATE ${this.tableName} SET ${Object.keys(data).map(k => `${k} = ?`).join(', ')} WHERE id = ?`,
      params: [...Object.values(data), id]
    }));

    await db.transaction(queries);
  }
}
