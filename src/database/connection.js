/**
 * Database Connection Layer with Transaction Management
 * Provides enhanced IPC bridge with error handling, retry logic, and connection pooling simulation
 */

import { getIpcRenderer } from '../utils/electronBridge.js';

class DatabaseConnection {
  constructor() {
    this.queryCache = new Map();
    this.cacheTimeout = 0; // Disabled: zero delay, direct SQLite reads
    this.retryAttempts = 3;
    this.retryDelay = 500;
  }

  /**
   * Execute SELECT query directly
   */
  async query(sql, params = []) {
    return await this._executeWithRetry('db:query', { sql, params });
  }

  /**
   * Execute INSERT/UPDATE/DELETE with automatic retry
   */
  async run(sql, params = []) {
    // Invalidate cache on mutations
    this.invalidateCache();
    return await this._executeWithRetry('db:run', { sql, params });
  }

  /**
   * Alias for run (execute arbitrary SQL)
   */
  async execute(sql, params = []) {
    return await this.run(sql, params);
  }

  /**
   * Get single row
   */
  async get(sql, params = []) {
    const result = await this._executeWithRetry('db:get', { sql, params });
    return result;
  }

  /**
   * Execute multiple queries in an atomic native transaction
   */
  async transaction(queries) {
    this.invalidateCache();
    return await this._executeWithRetry('db:transaction', { queries });
  }

  /**
   * Execute with retry logic
   */
  async _executeWithRetry(channel, payload, attempt = 1) {
    try {
      const ipc = getIpcRenderer();
      if (!ipc) {
        throw new Error('Electron IPCRenderer not available in this environment');
      }
      const result = await ipc.invoke(channel, payload);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    } catch (error) {
      if (attempt < this.retryAttempts) {
        await this._sleep(this.retryDelay * attempt);
        return this._executeWithRetry(channel, payload, attempt + 1);
      }

      throw new Error(`Database error after ${this.retryAttempts} attempts: ${error.message}`);
    }
  }

  /**
   * Clear query cache
   */
  invalidateCache() {
    this.queryCache.clear();
  }

  /**
   * Clear specific cache entries by pattern
   */
  invalidateCachePattern(pattern) {
    for (const key of this.queryCache.keys()) {
      if (key.includes(pattern)) {
        this.queryCache.delete(key);
      }
    }
  }

  /**
   * Sleep utility
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const db = new DatabaseConnection();

// Export for backward compatibility
export default db;
