/**
 * Debtors Repository
 * Handles debtor accounts and debt transaction history
 */

import { BaseRepository } from './BaseRepository.js';
import { db } from '../connection.js';

export class DebtorsRepository extends BaseRepository {
  constructor() {
    super('debtors');
  }

  /**
   * Get all debtors sorted by debt amount
   */
  async getAllDebtors() {
    return await this.findAll({}, 'total_debt DESC, name ASC');
  }

  /**
   * Get debtors with active debt
   */
  async getActiveDebtors() {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE total_debt > 0
      ORDER BY total_debt DESC
    `;
    return await db.query(sql);
  }

  /**
   * Get debt history for a debtor
   */
  async getDebtorHistory(debtorId) {
    const sql = `
      SELECT * FROM debt_history
      WHERE debtor_id = ?
      ORDER BY date DESC
    `;
    return await db.query(sql, [debtorId]);
  }

  /**
   * Add debt transaction and update total
   */
  async addDebtTransaction(debtorId, transactionData) {
    const queries = [];

    // Insert transaction
    const txKeys = Object.keys(transactionData);
    const txPlaceholders = txKeys.map(() => '?').join(', ');
    queries.push({
      sql: `INSERT INTO debt_history (${txKeys.join(', ')}) VALUES (${txPlaceholders})`,
      params: Object.values(transactionData)
    });

    // Update debtor total
    const operator = transactionData.type === 'debt' ? '+' : '-';
    queries.push({
      sql: `UPDATE ${this.tableName} SET total_debt = total_debt ${operator} ? WHERE id = ?`,
      params: [transactionData.amount, debtorId]
    });

    await db.transaction(queries);

    return await this.findById(debtorId);
  }

  /**
   * Get debtor with history
   */
  async getDebtorWithHistory(debtorId) {
    const debtor = await this.findById(debtorId);
    if (!debtor) return null;

    const history = await this.getDebtorHistory(debtorId);

    return { ...debtor, history };
  }

  /**
   * Get debt aging report
   */
  async getDebtAgingReport() {
    const sql = `
      SELECT
        d.id,
        d.name,
        d.phone,
        d.total_debt,
        MIN(dh.date) as first_debt_date,
        MAX(dh.date) as last_transaction_date,
        CAST((julianday('now') - julianday(MIN(dh.date))) AS INTEGER) as days_outstanding
      FROM ${this.tableName} d
      LEFT JOIN debt_history dh ON d.id = dh.debtor_id AND dh.type = 'debt'
      WHERE d.total_debt > 0
      GROUP BY d.id, d.name, d.phone, d.total_debt
      ORDER BY days_outstanding DESC
    `;
    return await db.query(sql);
  }

  /**
   * Get total debt across all debtors
   */
  async getTotalDebt() {
    const sql = `SELECT SUM(total_debt) as total FROM ${this.tableName}`;
    const result = await db.get(sql);
    return result.total || 0;
  }

  /**
   * Search debtors
   */
  async searchDebtors(term) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE name LIKE ? OR phone LIKE ?
      ORDER BY name ASC
    `;
    const searchTerm = `%${term}%`;
    return await db.query(sql, [searchTerm, searchTerm]);
  }

  /**
   * Get payment history summary for a debtor
   */
  async getPaymentSummary(debtorId) {
    const sql = `
      SELECT
        type,
        COUNT(*) as transaction_count,
        SUM(amount) as total_amount
      FROM debt_history
      WHERE debtor_id = ?
      GROUP BY type
    `;
    return await db.query(sql, [debtorId]);
  }
}
