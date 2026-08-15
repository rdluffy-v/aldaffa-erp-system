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
   * Get withdrawals in date range
   */
  async getWithdrawalsInRange(startDate, endDate) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE date >= ? AND date <= ?
      ORDER BY date DESC
    `;
    return await db.query(sql, [startDate, endDate]);
  }

  /**
   * Get withdrawals summary
   */
  async getWithdrawalsSummary(startDate, endDate) {
    const sql = `
      SELECT
        COUNT(*) as total_withdrawals,
        SUM(amount) as total_amount,
        AVG(amount) as average_amount,
        MAX(amount) as max_amount
      FROM ${this.tableName}
      WHERE date >= ? AND date <= ?
    `;
    return await db.get(sql, [startDate, endDate]);
  }

  /**
   * Get withdrawals by recipient
   */
  async getWithdrawalsByRecipient(recipient) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE recipient = ?
      ORDER BY date DESC
    `;
    return await db.query(sql, [recipient]);
  }

  /**
   * Get all recipients
   */
  async getRecipients() {
    const sql = `
      SELECT DISTINCT recipient, COUNT(*) as withdrawal_count, SUM(amount) as total_amount
      FROM ${this.tableName}
      WHERE recipient IS NOT NULL AND recipient != ''
      GROUP BY recipient
      ORDER BY withdrawal_count DESC
    `;
    return await db.query(sql);
  }

  /**
   * Search withdrawals
   */
  async searchWithdrawals(term) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE reason LIKE ? OR recipient LIKE ?
      ORDER BY date DESC
    `;
    const searchTerm = `%${term}%`;
    return await db.query(sql, [searchTerm, searchTerm]);
  }

  /**
   * Get monthly withdrawal totals
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
}
