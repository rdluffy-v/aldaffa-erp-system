/**
 * Cloudflare D1 Client Wrapper for Aldaffa ERP Cloud Sync Engine
 * Handles schema queries, transactions, versioning, and delta changelogs.
 */

const inFlightOperations = new Map();

export class D1Client {
  constructor(db) {
    this.db = db;
  }

  /**
   * Helper to execute a single row fetch
   */
  async get(sql, ...params) {
    const stmt = this.db.prepare(sql);
    const bound = params.length > 0 ? stmt.bind(...params) : stmt;
    if (typeof bound.first === 'function') {
      return await bound.first();
    }
    const res = await bound.all();
    const rows = res.results || res || [];
    return rows[0] || null;
  }

  /**
   * Helper to execute multi-row fetch
   */
  async all(sql, ...params) {
    const stmt = this.db.prepare(sql);
    const bound = params.length > 0 ? stmt.bind(...params) : stmt;
    const res = await bound.all();
    return res.results || res || [];
  }

  /**
   * Helper to execute write query
   */
  async run(sql, ...params) {
    const stmt = this.db.prepare(sql);
    const bound = params.length > 0 ? stmt.bind(...params) : stmt;
    return await bound.run();
  }

  /**
   * Fetch Store details by ID
   */
  async getStore(storeId) {
    return await this.get('SELECT * FROM stores WHERE id = ?', storeId);
  }

  /**
   * Create or update store record
   */
  async upsertStore(store) {
    const now = new Date().toISOString();
    return await this.run(
      `INSERT INTO stores (id, name, currency, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, currency = excluded.currency, updated_at = excluded.updated_at`,
      store.id,
      store.name || 'الدفة للعطور',
      store.currency || 'د.ل',
      store.created_at || now,
      now
    );
  }

  /**
   * Fetch device by unique device token
   */
  async getDeviceByToken(deviceToken) {
    return await this.get(
      'SELECT * FROM devices WHERE device_token = ? AND is_active = 1',
      deviceToken
    );
  }

  /**
   * Register or update paired device
   */
  async registerDevice({ id, storeId, name, deviceToken }) {
    const now = new Date().toISOString();
    return await this.run(
      `INSERT INTO devices (id, store_id, name, device_token, is_active, last_seen_at, created_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, device_token = excluded.device_token, last_seen_at = excluded.last_seen_at`,
      id,
      storeId,
      name,
      deviceToken,
      now,
      now
    );
  }

  /**
   * Update device last seen timestamp
   */
  async touchDevice(deviceToken) {
    const now = new Date().toISOString();
    return await this.run(
      'UPDATE devices SET last_seen_at = ? WHERE device_token = ?',
      now,
      deviceToken
    );
  }

  /**
   * Fetch current global version sequence for a store
   */
  async getCurrentVersion(storeId) {
    const row = await this.get(
      `SELECT COALESCE(MAX(v), 0) as maxVer FROM (
         SELECT MAX(version) as v FROM sync_events WHERE store_id = ?
         UNION
         SELECT MAX(version) as v FROM products WHERE store_id = ?
       )`,
      storeId,
      storeId
    );
    return row?.maxVer || 0;
  }

  /**
   * Pull deltas (products, sales, sync_events) since given version or timestamp
   */
  async pullDeltas({ storeId, sinceVersion = 0, sinceDate = null }) {
    let productsQuery = 'SELECT * FROM products WHERE store_id = ?';
    const productParams = [storeId];
    if (sinceVersion > 0) {
      productsQuery += ' AND version > ?';
      productParams.push(sinceVersion);
    } else if (sinceDate) {
      productsQuery += ' AND updated_at > ?';
      productParams.push(sinceDate);
    }
    productsQuery += ' ORDER BY version ASC, updated_at ASC';

    let salesQuery = 'SELECT * FROM sales WHERE store_id = ?';
    const salesParams = [storeId];
    if (sinceDate) {
      salesQuery += ' AND (synced_at > ? OR date > ?)';
      salesParams.push(sinceDate, sinceDate);
    }
    salesQuery += ' ORDER BY date ASC LIMIT 200';

    let eventsQuery = 'SELECT * FROM sync_events WHERE store_id = ? AND version > ? ORDER BY version ASC LIMIT 500';
    const eventsParams = [storeId, sinceVersion];

    const [products, sales, syncEvents, currentVersion] = await Promise.all([
      this.all(productsQuery, ...productParams),
      this.all(salesQuery, ...salesParams),
      this.all(eventsQuery, ...eventsParams),
      this.getCurrentVersion(storeId)
    ]);

    return {
      storeId,
      currentVersion,
      products,
      sales,
      sync_events: syncEvents
    };
  }

  /**
   * Push incoming delta events from mobile client or desktop into D1
   */
  async pushDeltaEvents({ storeId, deviceId = null, events = [] }) {
    if (!events || events.length === 0) {
      const curVer = await this.getCurrentVersion(storeId);
      return { syncedEventsCount: 0, currentVersion: curVer };
    }

    let currentVersion = await this.getCurrentVersion(storeId);
    let syncedCount = 0;
    const now = new Date().toISOString();

    for (const evt of events) {
      currentVersion++;
      const entityType = evt.entity_type || evt.type || 'unknown';
      const entityId = evt.entity_id || evt.id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const action = evt.action || 'upsert';
      const payload = typeof evt.payload === 'object' ? JSON.stringify(evt.payload) : (evt.payload || JSON.stringify(evt));

      // 1. Log to sync_events
      await this.run(
        `INSERT INTO sync_events (store_id, device_id, entity_type, entity_id, action, payload, created_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        storeId,
        deviceId,
        entityType,
        entityId,
        action,
        payload,
        now,
        currentVersion
      );

      // 2. Apply entity mutations directly to relational tables
      if (entityType === 'product' || entityType === 'inventory') {
        const p = typeof evt.payload === 'object' ? evt.payload : (typeof evt.data === 'object' ? evt.data : {});
        if (action === 'delete') {
          await this.run('UPDATE products SET is_active = 0, version = ?, updated_at = ? WHERE id = ? AND store_id = ?', currentVersion, now, entityId, storeId);
        } else if (p.name) {
          await this.run(
            `INSERT INTO products (id, store_id, name, barcode, category, qty, cost, price, wholesale_price, unit, min_qty, is_active, updated_at, version)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               barcode = excluded.barcode,
               category = excluded.category,
               qty = excluded.qty,
               cost = excluded.cost,
               price = excluded.price,
               wholesale_price = excluded.wholesale_price,
               unit = excluded.unit,
               min_qty = excluded.min_qty,
               is_active = excluded.is_active,
               updated_at = excluded.updated_at,
               version = excluded.version`,
            entityId,
            storeId,
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
            currentVersion
          );
        }
      } else if (entityType === 'sale' || entityType === 'pos_checkout') {
        const sale = typeof evt.payload === 'object' ? evt.payload : (typeof evt.data === 'object' ? evt.data : {});
        const saleId = sale.id || entityId;
        const subtotal = sale.subtotal ?? sale.total_amount ?? sale.total ?? 0;
        const discount = sale.discount ?? 0;
        const total = sale.total ?? sale.total_amount ?? (subtotal - discount);
        const profit = sale.profit ?? 0;
        const date = sale.date || now;
        const items = sale.items || [];

        // Insert sale
        await this.run(
          `INSERT INTO sales (id, store_id, device_id, invoice_number, date, subtotal, discount, total, profit, payment_method, customer_name, debtor_id, notes, created_at, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             synced_at = excluded.synced_at,
             total = excluded.total,
             profit = excluded.profit`,
          saleId,
          storeId,
          deviceId,
          sale.invoice_number || saleId,
          date,
          subtotal,
          discount,
          total,
          profit,
          sale.payment_method || sale.payment_type || 'cash',
          sale.customer_name || 'زبون نقدي',
          sale.debtor_id || null,
          sale.notes || 'مزامنة تطبيق الجوال',
          now,
          now
        );

        // Insert items & deduct product stock
        for (const it of items) {
          const itemId = it.id || `si_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const pId = it.product_id || it.productId;
          const qty = it.cart_qty ?? it.quantity ?? 1;
          const price = it.final_price ?? it.unit_price ?? it.unitPrice ?? 0;
          const cost = it.unit_cost ?? it.cost_price ?? it.costPrice ?? 0;

          await this.run(
            `INSERT INTO sale_items (id, sale_id, product_id, name, cart_qty, unit, final_price, unit_cost, portion_ml)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET cart_qty = excluded.cart_qty, final_price = excluded.final_price`,
            itemId,
            saleId,
            pId,
            it.name || 'عطر',
            qty,
            it.unit || 'piece',
            price,
            cost,
            it.portion_ml || null
          );

          if (pId) {
            await this.run(
              'UPDATE products SET qty = MAX(0, qty - ?), updated_at = ?, version = ? WHERE id = ? AND store_id = ?',
              qty,
              now,
              currentVersion,
              pId,
              storeId
            );
          }
        }
      } else if (entityType === 'inventory_adjust') {
        const adj = typeof evt.payload === 'object' ? evt.payload : (typeof evt.data === 'object' ? evt.data : {});
        const pId = adj.product_id || adj.productId || entityId;
        const newQty = adj.newQuantity ?? adj.counted_qty ?? adj.new_qty;
        if (pId && newQty !== undefined) {
          await this.run(
            'UPDATE products SET qty = ?, updated_at = ?, version = ? WHERE id = ? AND store_id = ?',
            newQty,
            now,
            currentVersion,
            pId,
            storeId
          );
        }
      }

      syncedCount++;
    }

    return {
      syncedEventsCount: syncedCount,
      currentVersion,
      timestamp: now
    };
  }

  /**
   * Process direct POS Checkout on Cloud
   */
  async processCheckout({ storeId, deviceId = null, saleData, idempotencyKey = null }) {
    if (idempotencyKey) {
      const cached = await this.getIdempotencyRecord(idempotencyKey);
      if (cached) return cached;

      if (inFlightOperations.has(idempotencyKey)) {
        return await inFlightOperations.get(idempotencyKey);
      }
    }

    const task = (async () => {
      if (idempotencyKey) {
        const cached = await this.getIdempotencyRecord(idempotencyKey);
        if (cached) return cached;
      }

      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const saleId = saleData.id || saleData.saleId || saleData.invoiceId || `INV-C-${Date.now()}-${randomSuffix}`;
      const now = new Date().toISOString();
      const items = saleData.items || [];
      const subtotal = saleData.subtotal ?? saleData.totalAmount ?? 0;
      const discount = saleData.discount || 0;
      const total = saleData.total ?? saleData.totalAmount ?? (subtotal - discount);
      
      let totalCost = 0;
      for (const item of items) {
        const pId = item.product_id || item.productId;
        const p = await this.get('SELECT cost FROM products WHERE id = ? AND store_id = ?', pId, storeId);
        const itemCost = (p?.cost || item.costPrice || item.unit_cost || 0) * (item.cart_qty ?? item.quantity ?? 1);
        totalCost += itemCost;
      }
      const profit = Math.max(0, total - totalCost - discount);

      let currentVersion = await this.getCurrentVersion(storeId);
      currentVersion++;

      // Insert sale
      await this.run(
        `INSERT INTO sales (id, store_id, device_id, invoice_number, date, subtotal, discount, total, profit, payment_method, customer_name, debtor_id, notes, created_at, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           total = excluded.total,
           profit = excluded.profit,
           synced_at = excluded.synced_at`,
        saleId,
        storeId,
        deviceId,
        saleData.invoice_number || saleId,
        saleData.date || now,
        subtotal,
        discount,
        total,
        profit,
        saleData.payment_method || saleData.paymentType || 'cash',
        saleData.customer_name || saleData.customerName || 'زبون نقدي',
        saleData.debtor_id || null,
        saleData.notes || 'نقطة بيع سحابية',
        now,
        now
      );

      // Insert items & deduct inventory
      for (const it of items) {
        const itemId = `si_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const pId = it.product_id || it.productId;
        const qty = it.cart_qty ?? it.quantity ?? 1;
        const price = it.final_price ?? it.unitPrice ?? it.unit_price ?? 0;
        const cost = it.unit_cost ?? it.costPrice ?? it.cost_price ?? 0;

        await this.run(
          `INSERT INTO sale_items (id, sale_id, product_id, name, cart_qty, unit, final_price, unit_cost, portion_ml)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET cart_qty = excluded.cart_qty, final_price = excluded.final_price`,
          itemId,
          saleId,
          pId,
          it.name || 'منتج',
          qty,
          it.unit || 'piece',
          price,
          cost,
          it.portion_ml || null
        );

        if (pId) {
          await this.run(
            'UPDATE products SET qty = MAX(0, qty - ?), updated_at = ?, version = ? WHERE id = ? AND store_id = ?',
            qty,
            now,
            currentVersion,
            pId,
            storeId
          );
        }
      }

      // Record sync event
      await this.run(
        `INSERT INTO sync_events (store_id, device_id, entity_type, entity_id, action, payload, created_at, version)
         VALUES (?, ?, 'sale', ?, 'create', ?, ?, ?)`,
        storeId,
        deviceId,
        saleId,
        JSON.stringify({ ...saleData, id: saleId, total, profit, totalCost }),
        now,
        currentVersion
      );

      const responseObj = {
        success: true,
        saleId,
        invoiceId: saleId,
        total,
        profit,
        date: now,
        currentVersion
      };

      if (idempotencyKey) {
        await this.saveIdempotencyRecord(idempotencyKey, responseObj);
      }

      return responseObj;
    })();

    if (idempotencyKey) {
      inFlightOperations.set(idempotencyKey, task);
      try {
        return await task;
      } finally {
        inFlightOperations.delete(idempotencyKey);
      }
    }

    return await task;
  }

  /**
   * Process Inventory Adjustment from camera audit
   */
  async adjustProductStock({ storeId, deviceId = null, productId, newQuantity, reason = 'جرد بالكاميرا' }) {
    const now = new Date().toISOString();
    const product = await this.get('SELECT * FROM products WHERE id = ? AND store_id = ?', productId, storeId);
    if (!product) {
      return { success: false, error: 'المنتج غير موجود' };
    }

    const prevQty = product.qty;
    let currentVersion = await this.getCurrentVersion(storeId);
    currentVersion++;

    await this.run(
      'UPDATE products SET qty = ?, updated_at = ?, version = ? WHERE id = ? AND store_id = ?',
      newQuantity,
      now,
      currentVersion,
      productId,
      storeId
    );

    await this.run(
      `INSERT INTO sync_events (store_id, device_id, entity_type, entity_id, action, payload, created_at, version)
       VALUES (?, ?, 'inventory_adjust', ?, 'update', ?, ?, ?)`,
      storeId,
      deviceId,
      productId,
      JSON.stringify({ productId, previousQuantity: prevQty, newQuantity, reason, date: now }),
      now,
      currentVersion
    );

    return {
      success: true,
      productId,
      productName: product.name,
      previousQuantity: prevQty,
      newQuantity,
      new_qty: newQuantity,
      logged_loss: true,
      currentVersion
    };
  }

  /**
   * Retrieve Real-Time Executive Dashboard Stats
   */
  async getDashboardStats({ storeId, date = null, userRole = 'manager' }) {
    const today = date || new Date().toISOString().split('T')[0];

    const salesRow = await this.get(
      `SELECT 
         COUNT(id) as totalInvoices,
         COALESCE(SUM(total), 0) as totalRevenue,
         COALESCE(SUM(profit), 0) as totalProfit,
         COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) as cashSales,
         COALESCE(SUM(CASE WHEN payment_method = 'debt' THEN total ELSE 0 END), 0) as debtSales,
         COALESCE(SUM(CASE WHEN payment_method = 'card' OR payment_method = 'bank' THEN total ELSE 0 END), 0) as cardSales
       FROM sales
       WHERE store_id = ? AND date LIKE ?`,
      storeId,
      `${today}%`
    );

    const topProducts = await this.all(
      `SELECT si.product_id as id, si.name, SUM(si.cart_qty) as sold_qty, SUM(si.final_price * si.cart_qty) as revenue
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       WHERE s.store_id = ? AND s.date LIKE ?
       GROUP BY si.product_id
       ORDER BY sold_qty DESC
       LIMIT 5`,
      storeId,
      `${today}%`
    );

    const isCashier = userRole === 'cashier';
    const invoicesCount = salesRow?.totalInvoices || 0;
    const totalRevenue = salesRow?.totalRevenue || 0;
    const totalProfit = isCashier ? null : (salesRow?.totalProfit || 0);
    const cashDrawer = salesRow?.cashSales || 0;

    return {
      success: true,
      storeId,
      date: today,
      today_sales: totalRevenue,
      today_profit: totalProfit,
      cash_drawer: cashDrawer,
      invoices_count: invoicesCount,
      top_perfumes: topProducts,
      hourly_velocity: isCashier ? [] : [
        { hour: '10:00', sales: totalRevenue * 0.3 },
        { hour: '14:00', sales: totalRevenue * 0.4 },
        { hour: '18:00', sales: totalRevenue * 0.3 }
      ],
      masked: isCashier,
      stats: {
        invoices: invoicesCount,
        revenue: totalRevenue,
        profit: totalProfit,
        cashDrawer,
        cashSales: salesRow?.cashSales || 0,
        debtSales: salesRow?.debtSales || 0,
        cardSales: salesRow?.cardSales || 0
      }
    };
  }

  /**
   * Idempotency handling
   */
  async reserveIdempotency(key, storeId = null) {
    if (!key) return { reserved: true, cached: null };
    const cached = await this.getIdempotencyRecord(key);
    if (cached) {
      return { reserved: false, cached };
    }
    return { reserved: true, cached: null };
  }

  async getIdempotencyRecord(key) {
    if (!key) return null;
    const row = await this.get('SELECT response_json FROM idempotency_keys WHERE key = ?', key);
    if (!row) return null;
    try {
      return JSON.parse(row.response_json);
    } catch (e) {
      return null;
    }
  }

  async saveIdempotencyRecord(key, responseObj) {
    if (!key || !responseObj) return;
    const now = new Date().toISOString();
    await this.run(
      'INSERT INTO idempotency_keys (key, created_at, response_json) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET response_json = excluded.response_json',
      key,
      now,
      JSON.stringify(responseObj)
    );
  }
}
