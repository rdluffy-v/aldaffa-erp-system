/**
 * Capital Repository
 * Handles capital injection records
 */

import { BaseRepository } from './BaseRepository.js';
import { db } from '../connection.js';

export class CapitalRepository extends BaseRepository {
  constructor() {
    super('capital_injections');
  }

  /**
   * Get capital injections in date range
   */
  async getInjectionsInRange(startDate, endDate) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE date >= ? AND date <= ?
      ORDER BY date DESC
    `;
    return await db.query(sql, [startDate, endDate]);
  }

  /**
   * Get capital summary
   */
  async getCapitalSummary(startDate, endDate) {
    const sql = `
      SELECT
        COUNT(*) as total_injections,
        SUM(amount) as total_capital,
        AVG(amount) as average_amount,
        MAX(amount) as max_amount,
        COUNT(DISTINCT donor_name) as unique_donors
      FROM ${this.tableName}
      WHERE date >= ? AND date <= ?
    `;
    return await db.get(sql, [startDate, endDate]);
  }

  /**
   * Get injections by donor
   */
  async getInjectionsByDonor(donorName) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE donor_name = ?
      ORDER BY date DESC
    `;
    return await db.query(sql, [donorName]);
  }

  /**
   * Get all donors
   */
  async getDonors() {
    const sql = `
      SELECT DISTINCT donor_name, donor_phone, COUNT(*) as injection_count, SUM(amount) as total_amount
      FROM ${this.tableName}
      WHERE donor_name IS NOT NULL AND donor_name != ''
      GROUP BY donor_name, donor_phone
      ORDER BY total_amount DESC
    `;
    return await db.query(sql);
  }

  /**
   * Search capital injections
   */
  async searchInjections(term) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE donor_name LIKE ? OR notes LIKE ? OR donor_phone LIKE ?
      ORDER BY date DESC
    `;
    const searchTerm = `%${term}%`;
    return await db.query(sql, [searchTerm, searchTerm, searchTerm]);
  }

  /**
   * Get monthly capital totals
   */
  async getMonthlyTotals(year) {
    const sql = `
      SELECT
        strftime('%m', date) as month,
        COUNT(*) as count,
        SUM(amount) as total
      FROM ${this.tableName}
      WHERE strftime('%Y', date) = ?
      GROUP BY month
      ORDER BY month
    `;
    return await db.query(sql, [year.toString()]);
  }

  /**
   * Get total capital raised
   */
  async getTotalCapital() {
    const sql = `SELECT SUM(amount) as total FROM ${this.tableName}`;
    const result = await db.get(sql);
    return result.total || 0;
  }
}
