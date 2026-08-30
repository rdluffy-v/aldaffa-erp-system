/**
 * In-Memory Mock Cloudflare Worker Test Harness
 * Simulates Cloudflare Worker + D1 (better-sqlite3 :memory:) + KV for 100% offline QA test execution.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import worker from '../../src/worker/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Creates an in-memory D1 Database simulation using better-sqlite3
 */
export function createMockD1(customSchema = null) {
  const db = new Database(':memory:');

  // Load schema from src/worker/schema.sql
  const schemaPath = path.resolve(__dirname, '../../src/worker/schema.sql');
  const schemaSql = customSchema || (fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, 'utf8') : '');

  if (schemaSql) {
    db.exec(schemaSql);
  }

  const wrapStmt = (stmt, boundArgs = []) => ({
    bind(...args) {
      return wrapStmt(stmt, args);
    },
    async all() {
      const results = stmt.all(...boundArgs);
      return { results, success: true, meta: { changes: 0 } };
    },
    async first(col = null) {
      const row = stmt.get(...boundArgs);
      if (!row) return null;
      if (col && typeof col === 'string') return row[col];
      return row;
    },
    async run() {
      const info = stmt.run(...boundArgs);
      return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
    },
    async raw() {
      return stmt.raw().all(...boundArgs);
    }
  });

  return {
    rawDb: db,
    prepare(sql) {
      const stmt = db.prepare(sql);
      return wrapStmt(stmt, []);
    },
    async batch(statements) {
      const runBatch = db.transaction((stmts) => {
        const results = [];
        for (const s of stmts) {
          if (!s) continue;
          if (typeof s.run === 'function') {
            results.push(s.run());
          }
        }
        return results;
      });
      const res = runBatch(statements);
      return res;
    },
    async exec(sql) {
      db.exec(sql);
      return { count: 1, duration: 0 };
    },
    close() {
      db.close();
    }
  };
}

/**
 * Creates an in-memory Cloudflare KV simulation with TTL expiration
 */
export function createMockKV() {
  const store = new Map(); // key -> { value, expiresAt, metadata }

  return {
    _store: store,
    async get(key, typeOrOptions = 'text') {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
      }
      if (typeOrOptions === 'json' || (typeof typeOrOptions === 'object' && typeOrOptions.type === 'json')) {
        try {
          return JSON.parse(entry.value);
        } catch (e) {
          return null;
        }
      }
      return entry.value;
    },
    async getWithMetadata(key, typeOrOptions = 'text') {
      const value = await this.get(key, typeOrOptions);
      const entry = store.get(key);
      return { value, metadata: entry?.metadata || null };
    },
    async put(key, value, options = {}) {
      const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      let expiresAt = null;
      if (options.expirationTtl !== undefined) {
        expiresAt = Date.now() + (options.expirationTtl * 1000);
      } else if (options.expiration !== undefined) {
        expiresAt = options.expiration * 1000;
      }
      store.set(key, {
        value: stringValue,
        expiresAt,
        metadata: options.metadata || null
      });
    },
    async delete(key) {
      store.delete(key);
    },
    async list(options = {}) {
      const prefix = options.prefix || '';
      const keys = [];
      const now = Date.now();
      for (const [k, v] of store.entries()) {
        if (v.expiresAt && now > v.expiresAt) {
          store.delete(k);
          continue;
        }
        if (!prefix || k.startsWith(prefix)) {
          keys.push({ name: k, expiration: v.expiresAt ? Math.floor(v.expiresAt / 1000) : undefined, metadata: v.metadata });
        }
      }
      return { keys, list_complete: true };
    }
  };
}

/**
 * High-Level Mock Cloudflare Worker Class used by Automated Verification Suites
 */
export class MockCloudflareWorker {
  constructor(options = {}) {
    this.mockD1 = createMockD1(options.schema);
    this.db = this.mockD1.rawDb;
    this.d1 = this.mockD1;
    this.kv = createMockKV();
    this.storeId = options.storeId || 'aldaffa_store_main';
    this.storeName = options.storeName || 'الدفة للعطور - الفرع الرئيسي';
    this.masterSecret = options.masterSecret || 'sec_aldaffa_master_crypto_key_2026';

    // Seed default store
    this.db.prepare(`
      INSERT OR REPLACE INTO stores (id, name, currency, created_at, updated_at)
      VALUES (?, ?, 'د.ل', datetime('now'), datetime('now'))
    `).run(this.storeId, this.storeName);

    this.env = {
      DB: this.mockD1,
      KV: this.kv,
      ENVIRONMENT: 'test',
      APP_NAME: 'Aldaffa Perfumes ERP Test Sync'
    };
  }

  /**
   * Generates dynamic HMAC signature
   */
  _sign(payloadStr) {
    return crypto.createHmac('sha256', this.masterSecret).update(payloadStr).digest('hex');
  }

  /**
   * Generate Pairing QR payload
   */
  async generatePairingQR(ttlSeconds = 600) {
    const token = `pair_${crypto.randomBytes(16).toString('hex')}`;
    const expiresAt = Date.now() + (ttlSeconds * 1000);
    const signature = this._sign(`${this.storeId}:${token}:${expiresAt}`);

    const qrPayload = {
      storeId: this.storeId,
      storeName: this.storeName,
      token,
      lanUrl: 'http://192.168.1.50:4848/mobile',
      cloudUrl: 'https://sync.aldaffa.com',
      expiresAt,
      signature
    };

    // Store in KV if TTL > 0
    if (ttlSeconds > 0) {
      await this.kv.put(`pair:${token}`, JSON.stringify(qrPayload), { expirationTtl: ttlSeconds });
    }

    return qrPayload;
  }

  /**
   * Claim pairing token
   */
  async claimPairing({ token, deviceId, deviceName, signature, storeId = this.storeId }) {
    if (!token || !deviceId || !deviceName) {
      return { success: false, status: 400, error: 'Missing required parameters (token, deviceId, deviceName)' };
    }

    // Check token existence in KV
    const kvEntry = await this.kv.get(`pair:${token}`, 'json');
    if (!kvEntry || (kvEntry.expiresAt && Date.now() > kvEntry.expiresAt)) {
      return { success: false, status: 401, error: 'Pairing token expired or not found' };
    }

    // Verify HMAC signature
    const expectedSig = this._sign(`${storeId}:${token}:${kvEntry.expiresAt}`);
    if (!signature || signature !== expectedSig) {
      return { success: false, status: 403, error: 'Invalid HMAC signature or tampered payload' };
    }

    const deviceToken = `dev_tok_${crypto.randomBytes(16).toString('hex')}`;
    const now = new Date().toISOString();

    // Register device in D1
    this.db.prepare(`
      INSERT OR REPLACE INTO devices (id, store_id, name, device_name, device_token, is_active, last_seen_at, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(deviceId, storeId, deviceName, deviceName, deviceToken, now, now);

    // Save device in KV
    await this.kv.put(`device:${deviceToken}`, JSON.stringify({
      deviceId,
      deviceName,
      storeId,
      deviceToken,
      isActive: 1
    }));

    return {
      success: true,
      status: 200,
      deviceToken,
      storeInfo: {
        storeId: this.storeId,
        storeName: this.storeName
      }
    };
  }

  /**
   * Authenticate with 4-digit PIN code
   */
  async authenticatePin({ pin, deviceToken }) {
    if (!pin) {
      return { success: false, status: 400, error: 'PIN code is required' };
    }

    if (deviceToken) {
      const devRow = this.db.prepare('SELECT is_active FROM devices WHERE device_token = ?').get(deviceToken);
      if (devRow && devRow.is_active === 0) {
        return { success: false, status: 403, error: 'Device is revoked or inactive' };
      }
    }

    const usersMap = {
      '1234': {
        id: 'usr_mgr',
        name: 'المدير العام',
        role: 'manager',
        permissions: {
          view_profit: true,
          view_profits: true,
          settings: true,
          purge_data: true,
          delete_invoice: true,
          manage_users: true,
          apply_discount: true,
          change_price: true,
          pos: true,
          analytics: true
        }
      },
      '9999': {
        id: 'usr_mgr_admin',
        name: 'المدير العام (الرئيسي)',
        role: 'manager',
        permissions: {
          view_profit: true,
          view_profits: true,
          settings: true,
          purge_data: true,
          delete_invoice: true,
          manage_users: true,
          apply_discount: true,
          change_price: true,
          pos: true,
          analytics: true
        }
      },
      '5678': {
        id: 'usr_acc',
        name: 'المحاسب المالي',
        role: 'accountant',
        permissions: {
          view_profit: true,
          view_profits: true,
          analytics: true,
          pos: true,
          apply_discount: true,
          settings: false,
          purge_data: false,
          delete_invoice: false,
          manage_users: false,
          change_price: false
        }
      },
      '2222': {
        id: 'usr_acc_1',
        name: 'المحاسب المالي',
        role: 'accountant',
        permissions: {
          view_profit: true,
          view_profits: true,
          analytics: true,
          pos: true,
          apply_discount: true,
          settings: false,
          purge_data: false,
          delete_invoice: false,
          manage_users: false,
          change_price: false
        }
      },
      '0000': {
        id: 'usr_csh',
        name: 'الكاشير المناوب',
        role: 'cashier',
        permissions: {
          pos: true,
          apply_discount: true,
          view_profit: false,
          view_profits: false,
          settings: false,
          purge_data: false,
          delete_invoice: false,
          manage_users: false,
          change_price: false,
          analytics: false
        }
      },
      '3333': {
        id: 'usr_csh_1',
        name: 'الكاشير المناوب',
        role: 'cashier',
        permissions: {
          pos: true,
          apply_discount: true,
          view_profit: false,
          view_profits: false,
          settings: false,
          purge_data: false,
          delete_invoice: false,
          manage_users: false,
          change_price: false,
          analytics: false
        }
      }
    };

    const user = usersMap[pin];
    if (!user) {
      return { success: false, status: 401, error: 'Incorrect PIN code' };
    }

    const sessionToken = `sess_${crypto.randomBytes(20).toString('hex')}`;
    return {
      success: true,
      status: 200,
      sessionToken,
      user
    };
  }

  /**
   * Revoke device
   */
  async revokeDevice(deviceId) {
    this.db.prepare('UPDATE devices SET is_active = 0 WHERE id = ?').run(deviceId);
    return { success: true };
  }

  /**
   * Regenerate master token / secret
   */
  async regenerateMasterToken() {
    this.masterSecret = 'sec_' + crypto.randomBytes(32).toString('hex');
    // Invalidate all pending pairing tokens from KV
    const list = await this.kv.list({ prefix: 'pair:' });
    for (const k of list.keys) {
      await this.kv.delete(k.name);
    }
    return { success: true, newMasterSecret: this.masterSecret };
  }

  /**
   * Dispatch HTTP request to Cloudflare Worker fetch handler
   */
  async request(urlPath, reqOptions = {}) {
    const fullUrl = urlPath.startsWith('http') ? urlPath : `https://sync.aldaffa.com${urlPath.startsWith('/') ? urlPath : '/' + urlPath}`;
    const method = reqOptions.method || 'GET';
    const headers = new Headers(reqOptions.headers || {});

    let body = undefined;
    if (reqOptions.body) {
      body = typeof reqOptions.body === 'object' ? JSON.stringify(reqOptions.body) : reqOptions.body;
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
    }

    const req = new Request(fullUrl, {
      method,
      headers,
      body
    });

    const ctx = { waitUntil() {}, passThroughOnException() {} };
    const response = await worker.fetch(req, this.env, ctx);

    let data = null;
    let text = '';
    try {
      text = await response.text();
      data = JSON.parse(text);
    } catch (e) {
      data = text;
    }

    return {
      status: response.status,
      headers: response.headers,
      data,
      text
    };
  }

  /**
   * Seed products helper
   */
  seedProducts(products = []) {
    const now = new Date().toISOString();
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO products (id, store_id, name, barcode, category, qty, cost, price, wholesale_price, unit, min_qty, is_active, updated_at, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertEvent = this.db.prepare(`
      INSERT INTO sync_events (store_id, entity_type, entity_id, action, payload, created_at, version)
      VALUES (?, 'product', ?, 'INSERT', ?, ?, ?)
    `);
    for (const p of products) {
      const ver = p.version !== undefined ? p.version : 1;
      insert.run(
        p.id,
        p.store_id || this.storeId,
        p.name,
        p.barcode || null,
        p.category || null,
        p.qty ?? p.stock_quantity ?? 0,
        p.cost ?? p.cost_price ?? 0,
        p.price ?? 0,
        p.wholesale_price ?? 0,
        p.unit || 'piece',
        p.min_qty ?? 5,
        p.is_active !== undefined ? (p.is_active ? 1 : 0) : 1,
        now,
        ver
      );
      if (ver > 0) {
        insertEvent.run(
          p.store_id || this.storeId,
          p.id,
          JSON.stringify({ name: p.name, price: p.price, qty: p.qty ?? 0 }),
          now,
          ver
        );
      }
    }
  }

  close() {
    this.mockD1.close();
  }
}

/**
 * Functional factory for backwards compatibility
 */
export function createMockCloudflareWorker(options = {}) {
  return new MockCloudflareWorker(options);
}
