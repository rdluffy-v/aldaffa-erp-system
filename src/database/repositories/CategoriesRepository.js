/**
 * Categories Repository
 * Handles product category records
 */

import { BaseRepository } from './BaseRepository.js';
import { db } from '../connection.js';

export class CategoriesRepository extends BaseRepository {
  constructor() {
    super('categories');
  }

  /**
   * Find a category by exact name (used for uniqueness checks)
   */
  async findByName(name) {
    return await this.findOne({ name });
  }

  /**
   * Get all categories with product counts
   */
  async getCategoriesWithProductCounts() {
    const sql = `
      SELECT c.*, COUNT(i.id) as product_count
      FROM ${this.tableName} c
      LEFT JOIN inventory i ON i.category = c.name
      GROUP BY c.id, c.name, c.icon
      ORDER BY c.name ASC
    `;
    return await db.query(sql);
  }

  /**
   * Get category with product count
   */
  async getCategoryWithCount(categoryId) {
    const sql = `
      SELECT c.*, COUNT(i.id) as product_count
      FROM ${this.tableName} c
      LEFT JOIN inventory i ON i.category = c.name
      WHERE c.id = ?
      GROUP BY c.id, c.name, c.icon
    `;
    return await db.get(sql, [categoryId]);
  }

  /**
   * Search categories by name
   */
  async searchCategories(term) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE name LIKE ?
      ORDER BY name ASC
    `;
    return await db.query(sql, [`%${term}%`]);
  }

  /**
   * Count products assigned to a category (by category name)
   */
  async countProductsInCategory(categoryName) {
    const sql = `
      SELECT COUNT(*) as count FROM inventory
      WHERE category = ?
    `;
    const result = await db.get(sql, [categoryName]);
    return result.count || 0;
  }
}
