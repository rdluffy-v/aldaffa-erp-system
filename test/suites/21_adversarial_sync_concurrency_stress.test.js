/**
 * Suite 21: Adversarial Sync & Concurrency Stress Test Suite
 * Challenger 1 (Sync & Concurrency Challenger)
 * 
 * Adversarial Verification of:
 * 1. 100 Concurrent Checkout Sync Requests with Duplicate Idempotency Keys (Zero Double Deductions).
 * 2. Cryptographic Token Tampering (Tampered HMAC Signatures, Expired >10m TTL, Tampered storeIds, Revoked Devices).
 * 3. Complete Network Blackout Simulation with 50 Offline Queued Transactions Flushed upon Reconnect.
 * 4. Commutative Stock Deduction Verification Across Parallel Mobile Devices (Independent Order Invariance).
 * 5. Memory Leak and Race Condition Stress Monitoring.
 */

import assert from 'assert';
import crypto from 'crypto';
import { MockCloudflareWorker } from '../harness/mock-cloudflare-worker.js';
import { createTestDb } from '../harness/test-db.js';
import { startMobileBridgeServer, stopMobileBridgeServer } from '../../server/mobileBridgeServer.cjs';
import http from 'http';

/**
 * Helper to simulate mobile offline queue
 */
class OfflineSyncQueueEngine {
  constructor(workerClient) {
    this.worker = workerClient;
    this.queue = [];
    this.deadLetterQueue = [];
    this.isOnline = false;
  }

  setOnline(status) {
    this.isOnline = Boolean(status);
  }

  enqueue(action, payload, customIdempotencyKey = null) {
    const id = 'q_' + crypto.randomBytes(8).toString('hex');
    const idempotencyKey = customIdempotencyKey || `idem_${action.toLowerCase()}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const record = {
      id,
      idempotencyKey,
      action,
      payload,
      createdAt: Date.now(),
      retryCount: 0,
      status: 'pending',
      lastError: null
    };
    this.queue.push(record);
    return record;
  }

  async flush() {
    if (!this.isOnline) {
      return { success: false, synced: 0, failed: 0, reason: 'CLIENT_OFFLINE' };
    }

    const pending = this.queue.filter(r => r.status === 'pending' || r.status === 'failed');
    let syncedCount = 0;
    let failedCount = 0;

    for (const record of pending) {
      record.status = 'in_flight';
      try {
        if (!record.payload || typeof record.payload !== 'object' || Object.keys(record.payload).length === 0) {
          throw new Error('CORRUPTED_QUEUE_RECORD_POISON_PILL');
        }

        let res = null;
        if (record.action === 'POS_CHECKOUT') {
          res = await this.worker.request('/api/v1/pos/checkout', {
            method: 'POST',
            body: {
              ...record.payload,
              idempotencyKey: record.idempotencyKey
            }
          });
        } else if (record.action === 'STOCK_AUDIT') {
          res = await this.worker.request('/api/v1/inventory/adjust', {
            method: 'POST',
            body: {
              ...record.payload,
              idempotencyKey: record.idempotencyKey
            }
          });
        }

        if (res && res.status === 200 && res.data && res.data.success) {
          record.status = 'acknowledged';
          record.response = res.data;
          syncedCount++;
        } else {
          throw new Error(res?.data?.error || `HTTP_${res?.status || 500}`);
        }
      } catch (err) {
        record.retryCount++;
        record.lastError = err.message;
        if (err.message.includes('POISON_PILL')) {
          record.status = 'dead_letter';
          this.deadLetterQueue.push(record);
        } else {
          record.status = 'failed';
          failedCount++;
        }
      }
    }

    return {
      success: failedCount === 0,
      synced: syncedCount,
      failed: failedCount,
      deadLetter: this.deadLetterQueue.length,
      remainingPending: this.queue.filter(r => r.status === 'pending' || r.status === 'failed').length
    };
  }
}

/**
 * Helper to make HTTP requests against local Desktop Bridge Server
 */
function makeHttpRequest(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: '127.0.0.1',
      port,
      path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(typeof options.body === 'object' ? JSON.stringify(options.body) : options.body);
    }
    req.end();
  });
}

export async function run() {
  const results = [];

  const test = async (name, fn) => {
    const start = Date.now();
    try {
      await fn();
      results.push({ name, passed: true, duration: Date.now() - start });
    } catch (err) {
      results.push({ name, passed: false, error: err, duration: Date.now() - start });
    }
  };

  // ==========================================================================
  // 1. 100 CONCURRENT CHECKOUT REQUESTS WITH DUPLICATE IDEMPOTENCY KEYS
  // ==========================================================================

  await test('21.1.1 100 Concurrent Checkout Requests with Duplicate Idempotency Keys (Zero Double Deductions)', async () => {
    const worker = new MockCloudflareWorker();

    const initialStockA = 1000;
    const initialStockB = 500;

    worker.seedProducts([
      { id: 'p_oud_supreme', name: 'عود سوبريم ملكي', qty: initialStockA, price: 300, cost: 150, version: 1 },
      { id: 'p_amber_gold', name: 'عنبر ذهبي نخب أول', qty: initialStockB, price: 200, cost: 90, version: 1 }
    ]);

    // Create 10 distinct unique transactions
    const uniqueTxCount = 10;
    const duplicatesPerTx = 10; // 10 * 10 = 100 total concurrent requests
    const uniqueTransactions = [];

    for (let i = 1; i <= uniqueTxCount; i++) {
      const idempotencyKey = `idem_batch_stress_tx_${i}_${crypto.randomBytes(4).toString('hex')}`;
      const saleId = `INV-STRESS-${1000 + i}`;
      const payload = {
        storeId: 'aldaffa_store_main',
        deviceId: `dev_pos_${(i % 3) + 1}`,
        idempotencyKey,
        saleId,
        invoice_number: saleId,
        subtotal: 800,
        total: 800,
        discount: 0,
        payment_method: i % 2 === 0 ? 'cash' : 'card',
        customer_name: `عميل تجريبي ${i}`,
        items: [
          { product_id: 'p_oud_supreme', name: 'عود سوبريم ملكي', cart_qty: 2, final_price: 300, unit_cost: 150 },
          { product_id: 'p_amber_gold', name: 'عنبر ذهبي نخب أول', cart_qty: 1, final_price: 200, unit_cost: 90 }
        ]
      };
      uniqueTransactions.push({ idempotencyKey, saleId, payload });
    }

    // Build the 100 request list by replicating each unique transaction 10 times
    const allRequests = [];
    for (const tx of uniqueTransactions) {
      for (let rep = 0; rep < duplicatesPerTx; rep++) {
        allRequests.push(tx.payload);
      }
    }

    assert.strictEqual(allRequests.length, 100, 'Must have exactly 100 requests to dispatch');

    // Shuffle the requests to simulate high-concurrency interleaved network arrival
    for (let i = allRequests.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allRequests[i], allRequests[j]] = [allRequests[j], allRequests[i]];
    }

    // Dispatch all 100 requests concurrently
    const responses = await Promise.all(
      allRequests.map(payload =>
        worker.request('/api/v1/pos/checkout', {
          method: 'POST',
          body: payload
        })
      )
    );

    // Verify all 100 responses returned 200 OK with success: true
    for (let i = 0; i < responses.length; i++) {
      assert.strictEqual(responses[i].status, 200, `Request #${i} must return HTTP 200`);
      assert.strictEqual(responses[i].data.success, true, `Request #${i} must have success: true`);
    }

    // Check Database State:
    // 1. Total sales rows must be EXACTLY uniqueTxCount (10), NOT 100
    const salesCount = await worker.d1.prepare('SELECT COUNT(*) as cnt FROM sales WHERE store_id = ?').bind('aldaffa_store_main').first('cnt');
    assert.strictEqual(salesCount, uniqueTxCount, `Expected exactly ${uniqueTxCount} sales rows in D1, found ${salesCount}`);

    // 2. Stock deductions must be strictly for the 10 unique transactions:
    // Expected SKU A: 1000 - (10 unique * 2 units) = 980
    const finalStockA = await worker.d1.prepare('SELECT qty FROM products WHERE id = ?').bind('p_oud_supreme').first('qty');
    assert.strictEqual(finalStockA, initialStockA - (uniqueTxCount * 2), `Expected SKU A stock to be 980, found ${finalStockA} (Zero double deductions verified)`);

    // Expected SKU B: 500 - (10 unique * 1 unit) = 490
    const finalStockB = await worker.d1.prepare('SELECT qty FROM products WHERE id = ?').bind('p_amber_gold').first('qty');
    assert.strictEqual(finalStockB, initialStockB - (uniqueTxCount * 1), `Expected SKU B stock to be 490, found ${finalStockB} (Zero double deductions verified)`);

    // 3. Verify Idempotency records in D1
    const idempotencyCount = await worker.d1.prepare('SELECT COUNT(*) as cnt FROM idempotency_keys').first('cnt');
    assert.strictEqual(idempotencyCount, uniqueTxCount, `Expected exactly ${uniqueTxCount} idempotency records, found ${idempotencyCount}`);

    worker.close();
  });

  await test('21.1.2 Desktop Bridge Server 50 Concurrent HTTP POS Checkouts (Zero Lock Contention)', async () => {
    const db = createTestDb();
    const port = 4851;

    // Seed test inventory in SQLite
    db.run(`INSERT INTO inventory (id, name, qty, price, cost) VALUES ('p_musk_pure', 'مسك الطهارة الصافي', 500, 50, 20)`);
    db.run(`INSERT INTO inventory (id, name, qty, price, cost) VALUES ('p_taif_rose', 'ورد طائفي فاخر', 300, 150, 70)`);

    startMobileBridgeServer(db.rawDb, port);

    // Fire 50 concurrent checkout requests to the local desktop HTTP bridge
    const concurrentRequests = Array.from({ length: 50 }, (_, i) => ({
      saleId: `INV-BRIDGE-${i + 1}`,
      totalAmount: 200,
      total: 200,
      paymentType: 'cash',
      customerName: `زبون محلي ${i + 1}`,
      items: [
        { productId: 'p_musk_pure', quantity: 1, unitPrice: 50, costPrice: 20 },
        { productId: 'p_taif_rose', quantity: 1, unitPrice: 150, costPrice: 70 }
      ]
    }));

    const responses = await Promise.all(
      concurrentRequests.map(body =>
        makeHttpRequest(port, '/api/pos/checkout', {
          method: 'POST',
          body
        })
      )
    );

    // Verify all 50 checkouts succeeded without SQLite BUSY lock errors
    for (let i = 0; i < responses.length; i++) {
      assert.strictEqual(responses[i].status, 200, `Bridge request #${i} status must be 200`);
      assert.strictEqual(responses[i].data.success, true, `Bridge request #${i} success must be true`);
    }

    // Verify final stock in SQLite:
    // Musk: 500 - 50 = 450
    const muskStock = db.get(`SELECT qty FROM inventory WHERE id = 'p_musk_pure'`).qty;
    assert.strictEqual(muskStock, 450, `Expected Musk stock 450, got ${muskStock}`);

    // Rose: 300 - 50 = 250
    const roseStock = db.get(`SELECT qty FROM inventory WHERE id = 'p_taif_rose'`).qty;
    assert.strictEqual(roseStock, 250, `Expected Rose stock 250, got ${roseStock}`);

    // Verify total sales count in SQLite
    const totalSales = db.get(`SELECT COUNT(*) as cnt FROM sales`).cnt;
    assert.strictEqual(totalSales, 50, `Expected 50 sales rows in SQLite, got ${totalSales}`);

    db.close();
    stopMobileBridgeServer();
  });

  // ==========================================================================
  // 2. CRYPTOGRAPHIC TOKEN TAMPERING RESILIENCE
  // ==========================================================================

  await test('21.2.1 Tampered HMAC-SHA256 Signature is Blocked (403 Forbidden)', async () => {
    const worker = new MockCloudflareWorker();
    const qr = await worker.generatePairingQR(600);

    // Tamper with signature: replace last 4 characters with bogus hex
    const tamperedSignature = qr.signature.substring(0, qr.signature.length - 4) + 'dead';

    const claimRes = await worker.claimPairing({
      token: qr.token,
      deviceId: 'dev_adversary_01',
      deviceName: 'هاتف مخترق',
      signature: tamperedSignature,
      storeId: qr.storeId
    });

    assert.strictEqual(claimRes.success, false, 'Tampered signature must be rejected');
    assert.strictEqual(claimRes.status, 403, 'Must return HTTP 403 Forbidden');
    assert(claimRes.error.includes('signature') || claimRes.error.includes('tampered'), 'Error must identify signature tampering');

    worker.close();
  });

  await test('21.2.2 Expired Pairing Token (>10m TTL) is Strictly Rejected (401 Unauthorized)', async () => {
    const worker = new MockCloudflareWorker();

    // Generate token with 0s TTL (already expired)
    const qr = await worker.generatePairingQR(0);

    const claimRes = await worker.claimPairing({
      token: qr.token,
      deviceId: 'dev_adversary_02',
      deviceName: 'هاتف متأخر',
      signature: qr.signature,
      storeId: qr.storeId
    });

    assert.strictEqual(claimRes.success, false, 'Expired token must be rejected');
    assert.strictEqual(claimRes.status, 401, 'Must return HTTP 401 Unauthorized');
    assert(claimRes.error.includes('expired') || claimRes.error.includes('not found'));

    worker.close();
  });

  await test('21.2.3 Tampered storeId in QR Payload Fails Claim Verification (403 Forbidden)', async () => {
    const worker = new MockCloudflareWorker();
    const qr = await worker.generatePairingQR(600);

    // Tamper with storeId (attacker tries to link token to rogue store)
    const claimRes = await worker.claimPairing({
      token: qr.token,
      deviceId: 'dev_adversary_03',
      deviceName: 'هاتف متسلل',
      signature: qr.signature,
      storeId: 'rogue_counterfeit_store_666'
    });

    assert.strictEqual(claimRes.success, false, 'Tampered storeId must fail verification');
    assert.strictEqual(claimRes.status, 403, 'Must return 403 Forbidden on store mismatch');

    worker.close();
  });

  await test('21.2.4 Revoked Mobile Device is Blocked from PIN Auth and Sync Operations', async () => {
    const worker = new MockCloudflareWorker();
    const qr = await worker.generatePairingQR(600);

    // Legitimate pairing claim
    const claimRes = await worker.claimPairing({
      token: qr.token,
      deviceId: 'dev_mobile_csh_revoked',
      deviceName: 'جهاز كاشير فرعي',
      signature: qr.signature,
      storeId: qr.storeId
    });

    assert.strictEqual(claimRes.success, true);
    const deviceToken = claimRes.deviceToken;

    // Normal PIN auth works
    const authBefore = await worker.authenticatePin({ pin: '3333', deviceToken });
    assert.strictEqual(authBefore.success, true);

    // Store Admin revokes the device
    await worker.revokeDevice('dev_mobile_csh_revoked');

    // Subsequent PIN auth on revoked device MUST BE BLOCKED (403)
    const authAfter = await worker.authenticatePin({ pin: '3333', deviceToken });
    assert.strictEqual(authAfter.success, false, 'Revoked device must not authenticate');
    assert.strictEqual(authAfter.status, 403, 'Must return 403 Forbidden for revoked device');
    assert(authAfter.error.includes('revoked') || authAfter.error.includes('inactive'));

    worker.close();
  });

  await test('21.2.5 Malformed Claim Requests Return 400 Bad Request', async () => {
    const worker = new MockCloudflareWorker();

    const missingToken = await worker.claimPairing({ deviceId: 'dev_1', deviceName: 'phone' });
    assert.strictEqual(missingToken.status, 400);

    const missingDeviceId = await worker.claimPairing({ token: 'pair_123', deviceName: 'phone' });
    assert.strictEqual(missingDeviceId.status, 400);

    const missingDeviceName = await worker.claimPairing({ token: 'pair_123', deviceId: 'dev_1' });
    assert.strictEqual(missingDeviceName.status, 400);

    worker.close();
  });

  // ==========================================================================
  // 3. COMPLETE NETWORK BLACKOUT SIMULATION WITH 50 OFFLINE QUEUED TRANSACTIONS
  // ==========================================================================

  await test('21.3.1 Complete Network Blackout Simulation: 50 Offline Queued Transactions Flushed upon Reconnect', async () => {
    const worker = new MockCloudflareWorker();

    // Initial product catalog with 5 distinct fragrance SKUs
    const initialInventory = [
      { id: 'p_black_afgano', name: 'بلاك أفغانو 100ml', qty: 100, price: 450, cost: 220, version: 1 },
      { id: 'p_baccarat_rouge', name: 'باكارات روج 540', qty: 120, price: 650, cost: 350, version: 1 },
      { id: 'p_sauvage_elixir', name: 'سوفاج إلكسير 60ml', qty: 80, price: 380, cost: 190, version: 1 },
      { id: 'p_aventus_creed', name: 'كريد أفينتوس 100ml', qty: 90, price: 700, cost: 400, version: 1 },
      { id: 'p_tobacco_vanille', name: 'توباكو فانيلا 50ml', qty: 70, price: 500, cost: 260, version: 1 }
    ];

    worker.seedProducts(initialInventory);

    const offlineQueue = new OfflineSyncQueueEngine(worker);
    offlineQueue.setOnline(false); // Disconnect network (Blackout Mode)

    // Expected quantity trackers
    const expectedDeductions = {
      p_black_afgano: 0,
      p_baccarat_rouge: 0,
      p_sauvage_elixir: 0,
      p_aventus_creed: 0,
      p_tobacco_vanille: 0
    };

    let expectedTotalRevenue = 0;
    let expectedTotalInvoices = 0;
    let expectedAuditsCount = 0;

    // Generate 35 diverse POS Sale Transactions offline
    for (let i = 1; i <= 35; i++) {
      const isMultiItem = i % 2 === 0;
      const skuIndex1 = (i % 5);
      const skuIndex2 = ((i + 2) % 5);

      const prod1 = initialInventory[skuIndex1];
      const prod2 = initialInventory[skuIndex2];

      const qty1 = (i % 3) + 1;
      const qty2 = isMultiItem ? 1 : 0;

      expectedDeductions[prod1.id] += qty1;
      if (isMultiItem) expectedDeductions[prod2.id] += qty2;

      const subtotal = (prod1.price * qty1) + (isMultiItem ? prod2.price * qty2 : 0);
      const discount = i % 5 === 0 ? 20 : 0;
      const total = subtotal - discount;

      expectedTotalRevenue += total;
      expectedTotalInvoices++;

      const items = [
        { product_id: prod1.id, name: prod1.name, cart_qty: qty1, final_price: prod1.price, unit_cost: prod1.cost }
      ];
      if (isMultiItem) {
        items.push({ product_id: prod2.id, name: prod2.name, cart_qty: qty2, final_price: prod2.price, unit_cost: prod2.cost });
      }

      offlineQueue.enqueue('POS_CHECKOUT', {
        storeId: 'aldaffa_store_main',
        deviceId: 'dev_blackout_pos_1',
        saleId: `INV-OFFLINE-${1000 + i}`,
        invoice_number: `INV-OFFLINE-${1000 + i}`,
        subtotal,
        discount,
        total,
        payment_method: i % 3 === 0 ? 'card' : (i % 3 === 1 ? 'cash' : 'debt'),
        customer_name: `زبون انقطاع ${i}`,
        items
      });
    }

    // Generate 15 Camera Stocktaking Audits offline on various SKUs
    const auditReasons = ['عجز جرد مخزني', 'كسر/تلف', 'عينة تجربة/Tester'];
    for (let j = 1; j <= 15; j++) {
      const prod = initialInventory[j % 5];
      const currentTheoreticalQty = initialInventory[j % 5].qty - expectedDeductions[prod.id];
      const auditedQty = Math.max(5, currentTheoreticalQty - (j % 3)); // Adjust slightly down

      // The last audit sets the expected new quantity
      expectedAuditsCount++;

      offlineQueue.enqueue('STOCK_AUDIT', {
        storeId: 'aldaffa_store_main',
        deviceId: 'dev_blackout_scanner_1',
        productId: prod.id,
        newQuantity: auditedQty,
        counted_qty: auditedQty,
        reason: auditReasons[j % 3]
      });
    }

    assert.strictEqual(offlineQueue.queue.length, 50, 'Must have exactly 50 offline transactions queued');

    // 1. Attempt Flush while offline -> Must be blocked immediately
    const offlineFlush = await offlineQueue.flush();
    assert.strictEqual(offlineFlush.success, false);
    assert.strictEqual(offlineFlush.reason, 'CLIENT_OFFLINE');
    assert.strictEqual(offlineFlush.synced, 0);

    // 2. Reconnect Network (Online event fired)
    offlineQueue.setOnline(true);

    // 3. Execute Full Batch Flush
    const flushStart = Date.now();
    const onlineFlush = await offlineQueue.flush();
    const flushDuration = Date.now() - flushStart;

    assert.strictEqual(onlineFlush.success, true, 'Online flush must succeed with 0 failures');
    assert.strictEqual(onlineFlush.synced, 50, 'All 50 queued transactions must be synced');
    assert.strictEqual(onlineFlush.failed, 0, 'Zero transactions failed');
    assert.strictEqual(onlineFlush.remainingPending, 0, 'No remaining pending records');
    assert.strictEqual(onlineFlush.deadLetter, 0, 'No dead letters');

    // 4. Verify Database Integrity in D1 Mirror
    // Total sales rows in D1 must be exactly 35
    const d1SalesCount = await worker.d1.prepare('SELECT COUNT(*) as cnt FROM sales WHERE store_id = ?').bind('aldaffa_store_main').first('cnt');
    assert.strictEqual(d1SalesCount, 35, `Expected 35 sales in D1, found ${d1SalesCount}`);

    // Total revenue in D1 must match sum of offline invoices
    const d1Revenue = await worker.d1.prepare('SELECT SUM(total) as rev FROM sales WHERE store_id = ?').bind('aldaffa_store_main').first('rev');
    assert.strictEqual(Math.round(d1Revenue), Math.round(expectedTotalRevenue), `Expected D1 revenue ${expectedTotalRevenue}, found ${d1Revenue}`);

    // Total sync events recorded in D1 must be 50 flushed events + 5 initial product events = 55
    const d1SyncEventsCount = await worker.d1.prepare('SELECT COUNT(*) as cnt FROM sync_events WHERE store_id = ?').bind('aldaffa_store_main').first('cnt');
    assert.strictEqual(d1SyncEventsCount, 50 + initialInventory.length, `Expected 55 sync_events in D1, found ${d1SyncEventsCount}`);

    // Flush performance metric check (<1500ms for 50 offline operations)
    assert(flushDuration < 2000, `Flush duration (${flushDuration}ms) should be fast`);

    worker.close();
  });

  // ==========================================================================
  // 4. COMMUTATIVE STOCK DEDUCTIONS ACROSS PARALLEL MOBILE DEVICES
  // ==========================================================================

  await test('21.4.1 Commutative Stock Deductions (Order-Invariance Across Parallel Devices)', async () => {
    // We simulate 2 separate runs with identical transaction sets executed in reversed / permuted orders.
    // Commutative invariant: Final stock must be identical regardless of event arrival sequence.

    const initialStockMap = {
      p_musk_gazelle: 300,
      p_cambodian_oud: 200,
      p_damascus_rose: 250
    };

    // Define 10 independent checkout transactions from 5 parallel mobile devices
    const transactions = [
      { deviceId: 'dev_1', items: [{ id: 'p_musk_gazelle', qty: 5 }, { id: 'p_cambodian_oud', qty: 2 }] },
      { deviceId: 'dev_2', items: [{ id: 'p_cambodian_oud', qty: 10 }, { id: 'p_damascus_rose', qty: 4 }] },
      { deviceId: 'dev_3', items: [{ id: 'p_damascus_rose', qty: 15 }, { id: 'p_musk_gazelle', qty: 8 }] },
      { deviceId: 'dev_4', items: [{ id: 'p_musk_gazelle', qty: 12 }, { id: 'p_cambodian_oud', qty: 5 }] },
      { deviceId: 'dev_5', items: [{ id: 'p_damascus_rose', qty: 20 }, { id: 'p_musk_gazelle', qty: 3 }] },
      { deviceId: 'dev_1', items: [{ id: 'p_cambodian_oud', qty: 7 }, { id: 'p_damascus_rose', qty: 6 }] },
      { deviceId: 'dev_2', items: [{ id: 'p_musk_gazelle', qty: 10 }, { id: 'p_damascus_rose', qty: 5 }] },
      { deviceId: 'dev_3', items: [{ id: 'p_cambodian_oud', qty: 4 }, { id: 'p_musk_gazelle', qty: 6 }] },
      { deviceId: 'dev_4', items: [{ id: 'p_damascus_rose', qty: 8 }, { id: 'p_cambodian_oud', qty: 3 }] },
      { deviceId: 'dev_5', items: [{ id: 'p_musk_gazelle', qty: 4 }, { id: 'p_damascus_rose', qty: 7 }] }
    ];

    // Compute expected total deductions
    const totalDeductions = { p_musk_gazelle: 0, p_cambodian_oud: 0, p_damascus_rose: 0 };
    for (const tx of transactions) {
      for (const item of tx.items) {
        totalDeductions[item.id] += item.qty;
      }
    }

    // RUN 1: Forward Sequential Execution
    const worker1 = new MockCloudflareWorker();
    worker1.seedProducts([
      { id: 'p_musk_gazelle', name: 'مسك الغزال الأصلي', qty: initialStockMap.p_musk_gazelle, price: 100 },
      { id: 'p_cambodian_oud', name: 'عود كمبودي ملكي', qty: initialStockMap.p_cambodian_oud, price: 250 },
      { id: 'p_damascus_rose', name: 'ورد جوري دمشقي', qty: initialStockMap.p_damascus_rose, price: 180 }
    ]);

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      await worker1.request('/api/v1/pos/checkout', {
        method: 'POST',
        body: {
          storeId: 'aldaffa_store_main',
          deviceId: tx.deviceId,
          saleId: `INV-RUN1-${i}`,
          total: 500,
          items: tx.items.map(it => ({ product_id: it.id, cart_qty: it.qty, final_price: 100 }))
        }
      });
    }

    const run1StockMusk = await worker1.d1.prepare('SELECT qty FROM products WHERE id = ?').bind('p_musk_gazelle').first('qty');
    const run1StockOud = await worker1.d1.prepare('SELECT qty FROM products WHERE id = ?').bind('p_cambodian_oud').first('qty');
    const run1StockRose = await worker1.d1.prepare('SELECT qty FROM products WHERE id = ?').bind('p_damascus_rose').first('qty');

    // RUN 2: Reversed Order Interleaved Execution
    const worker2 = new MockCloudflareWorker();
    worker2.seedProducts([
      { id: 'p_musk_gazelle', name: 'مسك الغزال الأصلي', qty: initialStockMap.p_musk_gazelle, price: 100 },
      { id: 'p_cambodian_oud', name: 'عود كمبودي ملكي', qty: initialStockMap.p_cambodian_oud, price: 250 },
      { id: 'p_damascus_rose', name: 'ورد جوري دمشقي', qty: initialStockMap.p_damascus_rose, price: 180 }
    ]);

    const reversedTransactions = [...transactions].reverse();
    for (let i = 0; i < reversedTransactions.length; i++) {
      const tx = reversedTransactions[i];
      await worker2.request('/api/v1/pos/checkout', {
        method: 'POST',
        body: {
          storeId: 'aldaffa_store_main',
          deviceId: tx.deviceId,
          saleId: `INV-RUN2-${i}`,
          total: 500,
          items: tx.items.map(it => ({ product_id: it.id, cart_qty: it.qty, final_price: 100 }))
        }
      });
    }

    const run2StockMusk = await worker2.d1.prepare('SELECT qty FROM products WHERE id = ?').bind('p_musk_gazelle').first('qty');
    const run2StockOud = await worker2.d1.prepare('SELECT qty FROM products WHERE id = ?').bind('p_cambodian_oud').first('qty');
    const run2StockRose = await worker2.d1.prepare('SELECT qty FROM products WHERE id = ?').bind('p_damascus_rose').first('qty');

    // Invariant Checks:
    // 1. Run 1 stock must equal exact mathematical formula
    assert.strictEqual(run1StockMusk, initialStockMap.p_musk_gazelle - totalDeductions.p_musk_gazelle);
    assert.strictEqual(run1StockOud, initialStockMap.p_cambodian_oud - totalDeductions.p_cambodian_oud);
    assert.strictEqual(run1StockRose, initialStockMap.p_damascus_rose - totalDeductions.p_damascus_rose);

    // 2. Commutativity: Run 1 must strictly equal Run 2
    assert.strictEqual(run1StockMusk, run2StockMusk, 'Musk stock must converge under reversed arrival order');
    assert.strictEqual(run1StockOud, run2StockOud, 'Oud stock must converge under reversed arrival order');
    assert.strictEqual(run1StockRose, run2StockRose, 'Rose stock must converge under reversed arrival order');

    worker1.close();
    worker2.close();
  });

  await test('21.4.2 Fractional Decant Portion (ML) Commutative Concurrency and Precision', async () => {
    const worker = new MockCloudflareWorker();

    // 500ml Master Flacon
    const initialFlaconQty = 500.0;
    worker.seedProducts([
      { id: 'p_flacon_imperial', name: 'قارورة عنبر إمبريال 500ml', qty: initialFlaconQty, price: 15, unit: 'ml', version: 1 }
    ]);

    // 10 concurrent sales of fractional decants (3ml, 6ml, 12ml, 25ml portions)
    const portionDecants = [3.0, 6.0, 12.0, 25.0, 3.0, 6.0, 12.0, 3.0, 6.0, 25.0];
    const totalMlSold = portionDecants.reduce((a, b) => a + b, 0); // 101.0 ml

    await Promise.all(
      portionDecants.map((ml, idx) =>
        worker.request('/api/v1/pos/checkout', {
          method: 'POST',
          body: {
            storeId: 'aldaffa_store_main',
            deviceId: `dev_decant_${idx + 1}`,
            saleId: `INV-DECANT-${idx + 1}`,
            total: ml * 15,
            items: [
              { product_id: 'p_flacon_imperial', name: 'تعبئة قارورة عنبر إمبريال', cart_qty: ml, portion_ml: ml, final_price: ml * 15 }
            ]
          }
        })
      )
    );

    const finalStock = await worker.d1.prepare('SELECT qty FROM products WHERE id = ?').bind('p_flacon_imperial').first('qty');
    const expectedRemaining = initialFlaconQty - totalMlSold; // 500 - 101 = 399.0

    assert.strictEqual(finalStock, expectedRemaining, `Expected remaining flacon stock ${expectedRemaining}ml, got ${finalStock}ml`);

    worker.close();
  });

  // ==========================================================================
  // 5. MEMORY LEAK & RESOURCE STABILITY MONITORING
  // ==========================================================================

  await test('21.5.1 Memory Leak & Resource Stability Under High-Load Mutation Cycles', async () => {
    // Force garbage collection if available or check RSS delta
    if (global.gc) global.gc();
    const memBefore = process.memoryUsage();

    const worker = new MockCloudflareWorker();
    worker.seedProducts([
      { id: 'p_leak_sku', name: 'منتج اختبار التسريب', qty: 10000, price: 10 }
    ]);

    // Execute 200 rapid mutations
    for (let i = 0; i < 200; i++) {
      await worker.request('/api/v1/pos/checkout', {
        method: 'POST',
        body: {
          storeId: 'aldaffa_store_main',
          saleId: `INV-LEAK-${i}`,
          total: 10,
          items: [{ product_id: 'p_leak_sku', cart_qty: 1, final_price: 10 }]
        }
      });
    }

    if (global.gc) global.gc();
    const memAfter = process.memoryUsage();
    const heapDiffMB = (memAfter.heapUsed - memBefore.heapUsed) / (1024 * 1024);

    // Assert that heap growth during 200 transactions remains well under 50MB
    assert(heapDiffMB < 50, `Heap growth (${heapDiffMB.toFixed(2)} MB) must remain bounded`);

    worker.close();
  });

  return results;
}
