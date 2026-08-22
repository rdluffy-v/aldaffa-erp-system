/**
 * Base Repository Pattern
 * Provides common CRUD operations and query building
 */

import { db } from '../connection.js';

export class BaseRepository {
  constructor(tableName) {
    this.tableName = tableName;
  }

  /**
   * Find all records with optional filtering
   */
  async findAll(where = {}, orderBy = null) {
    let sql = `SELECT * FROM ${this.tableName}`;
    const params = [];

    if (Object.keys(where).length > 0) {
      const conditions = Object.keys(where).map(key => {
        params.push(where[key]);
        return `${key} = ?`;
      });
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    if (orderBy) {
      sql += ` ORDER BY ${orderBy}`;
    }

    return await db.query(sql, params);
  }

  /**
   * Find by ID
   */
  async findById(id) {
    const sql = `SELECT * FROM ${this.tableName} WHERE id = ?`;
    return await db.get(sql, [id]);
  }

  /**
   * Find one record by criteria
   */
  async findOne(where = {}) {
    let sql = `SELECT * FROM ${this.tableName}`;
    const params = [];

    if (Object.keys(where).length > 0) {
      const conditions = Object.keys(where).map(key => {
        params.push(where[key]);
        return `${key} = ?`;
      });
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ' LIMIT 1';

    const results = await db.query(sql, params);
    return results[0] || null;
  }

  /**
   * Create new record with self-healing column fallback
   */
  async create(data) {
    const sanitizeAndInsert = async (currentData) => {
      const keys = Object.keys(currentData);
      if (keys.length === 0) return { lastInsertRowid: null };
      const values = Object.values(currentData);
      const placeholders = keys.map(() => '?').join(', ');

      const sql = `INSERT INTO ${this.tableName} (${keys.join(', ')}) VALUES (${placeholders})`;
      try {
        return await db.run(sql, values);
      } catch (err) {
        const match = err.message && err.message.match(/has no column named (\w+)/i);
        if (match && match[1] && currentData[match[1]] !== undefined) {
          const nextData = { ...currentData };
          delete nextData[match[1]];
          return await sanitizeAndInsert(nextData);
        }
        throw err;
      }
    };

    return await sanitizeAndInsert(data);
  }

  /**
   * Update record by ID with self-healing column fallback
   */
  async update(id, data) {
    const sanitizeAndUpdate = async (currentData) => {
      const keys = Object.keys(currentData);
      if (keys.length === 0) return await this.findById(id);
      const values = Object.values(currentData);
      const setClause = keys.map(key => `${key} = ?`).join(', ');

      const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`;
      try {
        await db.run(sql, [...values, id]);
        return await this.findById(id);
      } catch (err) {
        const match = err.message && err.message.match(/has no column named (\w+)/i);
        if (match && match[1] && currentData[match[1]] !== undefined) {
          const nextData = { ...currentData };
          delete nextData[match[1]];
          return await sanitizeAndUpdate(nextData);
        }
        throw err;
      }
    };

    return await sanitizeAndUpdate(data);
  }

  /**
   * Delete record by ID
   */
  async delete(id) {
    const sql = `DELETE FROM ${this.tableName} WHERE id = ?`;
    await db.run(sql, [id]);
    return true;
  }

  /**
   * Count records
   */
  async count(where = {}) {
    let sql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    const params = [];

    if (Object.keys(where).length > 0) {
      const conditions = Object.keys(where).map(key => {
        params.push(where[key]);
        return `${key} = ?`;
      });
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    const result = await db.get(sql, params);
    return result.count;
  }

  /**
   * Check if record exists
   */
  async exists(where = {}) {
    const count = await this.count(where);
    return count > 0;
  }

  /**
   * Batch create
   */
  async createBatch(dataArray) {
    const results = [];

    for (const data of dataArray) {
      const result = await this.create(data);
      results.push(result);
    }

    return results;
  }

  /**
   * Search with LIKE
   */
  async search(field, term, orderBy = null) {
    let sql = `SELECT * FROM ${this.tableName} WHERE ${field} LIKE ?`;

    if (orderBy) {
      sql += ` ORDER BY ${orderBy}`;
    }

    return await db.query(sql, [`%${term}%`]);
  }

  /**
   * Paginate results
   */
  async paginate(page = 1, pageSize = 20, where = {}, orderBy = null) {
    const offset = (page - 1) * pageSize;

    let sql = `SELECT * FROM ${this.tableName}`;
    const params = [];

    if (Object.keys(where).length > 0) {
      const conditions = Object.keys(where).map(key => {
        params.push(where[key]);
        return `${key} = ?`;
      });
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    if (orderBy) {
      sql += ` ORDER BY ${orderBy}`;
    }

    sql += ` LIMIT ? OFFSET ?`;
    params.push(pageSize, offset);

    const items = await db.query(sql, params);
    const total = await this.count(where);

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize)
    };
  }
}
