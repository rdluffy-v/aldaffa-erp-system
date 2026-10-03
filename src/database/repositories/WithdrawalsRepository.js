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

  /**
   * Get all registered and past employee names from users table and withdrawals records
   */
  async getEmployeesList() {
    try {
      // 1. Fetch system users
      let users = [];
      try {
        users = await db.query(`SELECT id, name, role FROM users ORDER BY name ASC`);
      } catch (err) {
        console.warn('Could not query users table directly:', err);
      }

      // 2. Fetch distinct employee names previously recorded in withdrawals
      let pastEmployees = [];
      try {
        pastEmployees = await db.query(`
          SELECT DISTINCT employee_name as name
          FROM ${this.tableName}
          WHERE employee_name IS NOT NULL AND TRIM(employee_name) != ''
        `);
      } catch (err) {
        console.warn('Could not query past employees:', err);
      }

      const map = new Map();
      (users || []).forEach(u => {
        const cleanName = (u.name || '').trim();
        if (cleanName) {
          map.set(cleanName.toLowerCase(), {
            id: u.id,
            name: cleanName,
            role: u.role || 'staff',
            isUser: true
          });
        }
      });

      (pastEmployees || []).forEach(e => {
        const cleanName = (e.name || '').trim();
        if (cleanName && !map.has(cleanName.toLowerCase())) {
          map.set(cleanName.toLowerCase(), {
            id: `emp_${cleanName}`,
            name: cleanName,
            role: 'employee',
            isUser: false
          });
        }
      });

      return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    } catch (e) {
      console.warn('Error fetching employees list:', e);
      return [];
    }
  }

  /**
   * Check if salary has already been paid for an employee for a specific month
   */
  async checkExistingSalary(employeeName, salaryMonth) {
    if (!employeeName || !salaryMonth) return null;
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE category = 'salary'
        AND LOWER(TRIM(employee_name)) = LOWER(TRIM(?))
        AND salary_month = ?
      ORDER BY date DESC
      LIMIT 1
    `;
    return await db.get(sql, [employeeName, salaryMonth]);
  }

  /**
   * Get latest salary payment for an employee
   */
  async getLatestSalaryForEmployee(employeeName) {
    if (!employeeName) return null;
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE category = 'salary'
        AND LOWER(TRIM(employee_name)) = LOWER(TRIM(?))
      ORDER BY date DESC
      LIMIT 1
    `;
    return await db.get(sql, [employeeName]);
  }

  /**
   * Get summary of salaries grouped by employee in date range
   */
  async getSalariesByEmployeeSummary(startDate, endDate) {
    const sql = `
      SELECT 
        employee_name,
        COUNT(*) as payments_count,
        SUM(amount) as total_amount,
        MAX(date) as last_payment_date,
        MAX(COALESCE(delivery_date, SUBSTR(date, 1, 10))) as last_delivery_date,
        MAX(salary_month) as last_salary_month
      FROM ${this.tableName}
      WHERE category = 'salary'
        AND date >= ? AND date <= ?
        AND employee_name IS NOT NULL AND TRIM(employee_name) != ''
      GROUP BY employee_name
      ORDER BY total_amount DESC
    `;
    return await db.query(sql, [startDate, endDate]);
  }

  /**
   * Get all salary payments made to an employee for a specific month (for multiple installments / advances)
   */
  async getEmployeeSalariesForMonth(employeeName, salaryMonth) {
    if (!employeeName || !salaryMonth) return [];
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE category = 'salary'
        AND LOWER(TRIM(employee_name)) = LOWER(TRIM(?))
        AND (salary_month = ? OR salary_month LIKE ?)
      ORDER BY date DESC
    `;
    return await db.query(sql, [employeeName, salaryMonth, `%${salaryMonth}%`]);
  }

  /**
   * Batch create multiple salaries atomically (for multi-employee payroll)
   */
  async batchCreateSalaries(salariesArray = []) {
    if (!Array.isArray(salariesArray) || salariesArray.length === 0) return { count: 0 };
    const queries = salariesArray.map((item) => {
      const keys = Object.keys(item);
      const values = Object.values(item);
      const placeholders = keys.map(() => '?').join(', ');
      return {
        sql: `INSERT INTO ${this.tableName} (${keys.join(', ')}) VALUES (${placeholders})`,
        params: values
      };
    });
    await db.transaction(queries);
    return { count: salariesArray.length };
  }

  /**
   * Get daily cash outflow grouped by date (for tracking every day money goes out)
   */
  async getDailyCashFlow(startDate, endDate) {
    const sql = `
      SELECT 
        COALESCE(delivery_date, SUBSTR(date, 1, 10)) as flow_date,
        SUM(CASE WHEN source = 'drawer' AND category != 'capital_asset' THEN amount ELSE 0 END) as drawer_total,
        SUM(CASE WHEN source = 'safe' OR category = 'capital_asset' THEN amount ELSE 0 END) as safe_total,
        SUM(amount) as day_total,
        COUNT(*) as count
      FROM ${this.tableName}
      WHERE date >= ? AND date <= ?
      GROUP BY flow_date
      ORDER BY flow_date DESC
    `;
    return await db.query(sql, [startDate, endDate]);
  }
}


