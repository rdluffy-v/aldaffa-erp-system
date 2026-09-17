/**
 * Withdrawals Repository
 * Handles cash withdrawal records
 */

import { BaseRepository } from './BaseRepository.js';
import { db } from '../connection.js';

export class WithdrawalsRepository extends BaseRepository {
  constructor() {
    super('withdrawals');
  }

  /**
   * Get withdrawals in date range with optional category and source filters
   */
  async getWithdrawalsInRange(startDate, endDate, category = null, source = null) {
    let sql = `
      SELECT * FROM ${this.tableName}
      WHERE date >= ? AND date <= ?
    `;
    const params = [startDate, endDate];

    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }
    if (source) {
      sql += ` AND source = ?`;
      params.push(source);
    }

    sql += ` ORDER BY date DESC`;
    return await db.query(sql, params);
  }

  /**
   * Get withdrawals summary with optional category and source filters
   */
  async getWithdrawalsSummary(startDate, endDate, category = null, source = null) {
    let sql = `
      SELECT
        COUNT(*) as total_withdrawals,
        SUM(amount) as total_amount,
        AVG(amount) as average_amount,
        MAX(amount) as max_amount
      FROM ${this.tableName}
      WHERE date >= ? AND date <= ?
    `;
    const params = [startDate, endDate];

    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }
    if (source) {
      sql += ` AND source = ?`;
      params.push(source);
    }

    return await db.get(sql, params);
  }

  /**
   * Get salaries (مرتبات) in date range
   */
  async getSalaries(startDate, endDate) {
    return await this.getWithdrawalsInRange(startDate, endDate, 'salary');
  }

  /**
   * Get capital assets / equipment expenses in date range
   */
  async getCapitalAssets(startDate, endDate) {
    return await this.getWithdrawalsInRange(startDate, endDate, 'capital_asset');
  }

  /**
   * Get drawer-only cash withdrawals (which affect the physical POS shift cash)
   */
  async getDrawerWithdrawalsTotal(startDate, endDate) {
    const sql = `
      SELECT COALESCE(SUM(amount), 0) as total
      FROM ${this.tableName}
      WHERE date >= ? AND date <= ?
        AND (source = 'drawer' OR source IS NULL OR source = '')
        AND category != 'capital_asset'
    `;
    const row = await db.get(sql, [startDate, endDate]);
    return row?.total || 0;
  }

  /**
   * Get withdrawals by recipient
   */
  async getWithdrawalsByRecipient(recipient) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE recipient = ? OR employee_name = ?
      ORDER BY date DESC
    `;
    return await db.query(sql, [recipient, recipient]);
  }

  /**
   * Get all recipients and employees
   */
  async getRecipients() {
    const sql = `
      SELECT DISTINCT COALESCE(NULLIF(employee_name, ''), recipient) as recipient,
             COUNT(*) as withdrawal_count,
             SUM(amount) as total_amount
      FROM ${this.tableName}
      WHERE (recipient IS NOT NULL AND recipient != '')
         OR (employee_name IS NOT NULL AND employee_name != '')
      GROUP BY recipient
      ORDER BY withdrawal_count DESC
    `;
    return await db.query(sql);
  }

  /**
   * Search withdrawals
   */
  async searchWithdrawals(term, category = null) {
    let sql = `
      SELECT * FROM ${this.tableName}
      WHERE (reason LIKE ? OR recipient LIKE ? OR employee_name LIKE ? OR asset_name LIKE ? OR notes LIKE ?)
    `;
    const searchTerm = `%${term}%`;
    const params = [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm];

    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }

    sql += ` ORDER BY date DESC`;
    return await db.query(sql, params);
  }

  /**
   * Get monthly withdrawal totals by category
   */
  async getMonthlyTotals(year) {
    const sql = `
      SELECT
        strftime('%m', date) as month,
        category,
        source,
        COUNT(*) as count,
        SUM(amount) as total
      FROM ${this.tableName}
      WHERE strftime('%Y', date) = ?
      GROUP BY month, category, source
      ORDER BY month
    `;
    return await db.query(sql, [year.toString()]);
  }
}
