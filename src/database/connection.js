/**
 * Database Connection Layer with Transaction Management
 * Provides enhanced IPC bridge with error handling, retry logic, and connection pooling simulation
 */

const { ipcRenderer } = window.require('electron');

class DatabaseConnection {
  constructor() {
    this.queryCache = new Map();
    this.cacheTimeout = 5000; // 5 seconds cache for read queries
    this.retryAttempts = 3;
    this.retryDelay = 1000;
  }

  /**
   * Execute SELECT query with caching
   */
  async query(sql, params = []) {
    const cacheKey = `${sql}:${JSON.stringify(params)}`;

    // Check cache for read queries
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      const cached = this.queryCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
    }

    const result = await this._executeWithRetry('db:query', { sql, params });

    // Cache SELECT results
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      this.queryCache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });
    }

    return result;
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
   * Get single row
   */
  async get(sql, params = []) {
    const result = await this._executeWithRetry('db:get', { sql, params });
    return result;
  }

  /**
   * Execute multiple queries in transaction
   */
  async transaction(queries) {
    try {
      await this.run('BEGIN TRANSACTION');

      const results = [];
      for (const { sql, params } of queries) {
        const result = await ipcRenderer.invoke('db:run', { sql, params });
        if (!result.success) {
          throw new Error(result.error);
        }
        results.push(result.data);
      }

      await this.run('COMMIT');
      this.invalidateCache();

      return results;
    } catch (error) {
      await this.run('ROLLBACK').catch(() => {});
      throw error;
    }
  }

  /**
   * Execute with retry logic
   */
  async _executeWithRetry(channel, payload, attempt = 1) {
    try {
      const result = await ipcRenderer.invoke(channel, payload);

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
