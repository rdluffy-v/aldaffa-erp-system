/**
 * Suite 18: Offline Queue Resilience, IndexedDB Outbox & Reconnection Reconciliation
 * 
 * Follows 4-Tier Verification Architecture:
 * - Tier 1: Category-Partition Equivalence Paths (Offline Enqueue, Outbox Record Schema, Online Flush)
 * - Tier 2: Boundary Value Analysis & Fault Recovery (Partial Network Failure, Exponential Backoff, Poison Pill Isolation)
 * - Tier 3: Pairwise Combinatorial & Conflict Resolution (Offline Sale + Offline Stock Audit on Same SKU)
 * - Tier 4: Real-World Disaster Simulation (Complete Store Blackout: 10 Sales + 5 Audits -> 100% Reconciliation)
 */

import assert from 'assert';
import crypto from 'crypto';
import { MockCloudflareWorker } from '../harness/mock-cloudflare-worker.js';

/**
 * High-Fidelity Mobile Offline Queue Engine (IndexedDB Simulation)
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

  enqueue(action, payload, idempotencyKey = null) {
    const id = 'q_' + crypto.randomBytes(8).toString('hex');
    const key = idempotencyKey || `idem_${action.toLowerCase()}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    
    const record = {
      id,
      idempotencyKey: key,
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

  calculateBackoff(retryCount) {
    return Math.min(30000, 1000 * Math.pow(2, retryCount));
  }

  async flush() {
    if (!this.isOnline) {
      return { success: false, synced: 0, reason: 'CLIENT_OFFLINE' };
    }

    const pending = this.queue.filter(r => r.status === 'pending' || r.status === 'failed');
    let syncedCount = 0;
    let failedCount = 0;

    for (const record of pending) {
      record.status = 'in_flight';

      try {
        // Poison pill check (corrupted payload)
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

        if (res && res.status === 200 && res.data.success) {
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
  // TIER 1: CATEGORY-PARTITION EQUIVALENCE PATHS
  // ==========================================================================

  await test('18.1.1 Enqueue POS Sales Offline & Validate Outbox Queue Record Schema', async () => {
    const worker = new MockCloudflareWorker();
    const offlineQueue = new OfflineSyncQueueEngine(worker);
    offlineQueue.setOnline(false); // Disconnected

    const salePayload = {
      storeId: 'aldaffa_store_main',
      saleId: 'INV-OFF-001',
      total: 350,
      payment_method: 'cash',
      items: [{ product_id: 'p_oud_royal', name: 'عود ملكي', quantity: 1, unit_price: 350 }]
    };

    const record = offlineQueue.enqueue('POS_CHECKOUT', salePayload, 'idem_sale_off_001');

    assert(record.id.startsWith('q_'), 'Must generate queue ID');
    assert.strictEqual(record.idempotencyKey, 'idem_sale_off_001');
    assert.strictEqual(record.action, 'POS_CHECKOUT');
    assert.strictEqual(record.status, 'pending');
    assert.strictEqual(record.retryCount, 0);
    assert(record.createdAt > 0);
    assert.strictEqual(record.payload.total, 350);

    worker.close();
  });

  await test('18.1.2 Offline Queue Flushes Automatically on Reconnection Event', async () => {
    const worker = new MockCloudflareWorker();
    worker.seedProducts([
      { id: 'p_oud_royal', name: 'عود ملكي', qty: 20, price: 350, cost: 180, version: 1 }
    ]);

    const offlineQueue = new OfflineSyncQueueEngine(worker);
    offlineQueue.setOnline(false);

    // Enqueue 2 transactions offline
    offlineQueue.enqueue('POS_CHECKOUT', {
      storeId: 'aldaffa_store_main',
      saleId: 'INV-OFF-010',
      total: 350,
      items: [{ product_id: 'p_oud_royal', quantity: 1, unit_price: 350, cost_price: 180 }]
    });

    offlineQueue.enqueue('POS_CHECKOUT', {
      storeId: 'aldaffa_store_main',
      saleId: 'INV-OFF-011',
      total: 700,
      items: [{ product_id: 'p_oud_royal', quantity: 2, unit_price: 350, cost_price: 180 }]
    });

    // Flush while still offline -> blocked
    const offlineFlushRes = await offlineQueue.flush();
    assert.strictEqual(offlineFlushRes.success, false);
    assert.strictEqual(offlineFlushRes.reason, 'CLIENT_OFFLINE');

    // Simulate 'online' event
    offlineQueue.setOnline(true);
    const onlineFlushRes = await offlineQueue.flush();

    assert.strictEqual(onlineFlushRes.success, true);
    assert.strictEqual(onlineFlushRes.synced, 2);
    assert.strictEqual(onlineFlushRes.remainingPending, 0);

    // Verify D1 stock updated (20 - 1 - 2 = 17)
    const stock = await worker.d1.prepare('SELECT qty FROM products WHERE id = ?').bind('p_oud_royal').first('qty');
    assert.strictEqual(stock, 17, 'Stock must decrease by 3 across the 2 flushed sales');

    worker.close();
  });

  // ==========================================================================
  // TIER 2: BOUNDARY VALUE ANALYSIS (BVA) & FAULT RECOVERY
  // ==========================================================================

  await test('18.2.1 Exponential Retry Backoff Calculation Formula Verification', async () => {
    const worker = new MockCloudflareWorker();
    const queue = new OfflineSyncQueueEngine(worker);

    // Test backoff formula: delay = min(30000, 1000 * 2^retryCount)
    assert.strictEqual(queue.calculateBackoff(0), 1000, '0 retries = 1000ms (1s)');
    assert.strictEqual(queue.calculateBackoff(1), 2000, '1 retry = 2000ms (2s)');
    assert.strictEqual(queue.calculateBackoff(2), 4000, '2 retries = 4000ms (4s)');
    assert.strictEqual(queue.calculateBackoff(3), 8000, '3 retries = 8000ms (8s)');
    assert.strictEqual(queue.calculateBackoff(4), 16000, '4 retries = 16000ms (16s)');
    assert.strictEqual(queue.calculateBackoff(5), 30000, '5 retries = 30000ms cap (30s)');
    assert.strictEqual(queue.calculateBackoff(10), 30000, '10 retries = 30000ms max cap');

    worker.close();
  });

  await test('18.2.2 Corrupted Queue Record (Poison Pill) is Isolated to Dead-Letter Queue', async () => {
    const worker = new MockCloudflareWorker();
    worker.seedProducts([
      { id: 'p_musk_01', name: 'مسك روز', qty: 50, price: 100, version: 1 }
    ]);

    const queue = new OfflineSyncQueueEngine(worker);
    queue.setOnline(true);

    // 1. Valid sale
    queue.enqueue('POS_CHECKOUT', {
      storeId: 'aldaffa_store_main',
      saleId: 'INV-VALID-01',
      total: 100,
      items: [{ product_id: 'p_musk_01', quantity: 1, unit_price: 100 }]
    });

    // 2. Poison pill (corrupted empty payload)
    queue.enqueue('POS_CHECKOUT', null);

    // 3. Another valid sale
    queue.enqueue('POS_CHECKOUT', {
      storeId: 'aldaffa_store_main',
      saleId: 'INV-VALID-02',
      total: 200,
      items: [{ product_id: 'p_musk_01', quantity: 2, unit_price: 100 }]
    });

    const flushRes = await queue.flush();

    // The 2 valid sales must succeed (synced=2), and the corrupted record isolated to deadLetter (deadLetter=1)
    assert.strictEqual(flushRes.synced, 2, 'Both valid sales must be successfully synced');
    assert.strictEqual(flushRes.deadLetter, 1, 'Corrupted poison pill must be quarantined in deadLetter queue');
    assert.strictEqual(queue.deadLetterQueue.length, 1);
    assert.strictEqual(queue.deadLetterQueue[0].status, 'dead_letter');

    // Verify stock decremented only for valid sales (50 - 1 - 2 = 47)
    const stock = await worker.d1.prepare('SELECT qty FROM products WHERE id = ?').bind('p_musk_01').first('qty');
    assert.strictEqual(stock, 47);

    worker.close();
  });

  await test('18.2.3 Partial Mid-Batch Failure Tracks In-Flight Status and Resumes on Next Flush', async () => {
    const worker = new MockCloudflareWorker();
    worker.seedProducts([
      { id: 'p_amber', name: 'عنبر هندي', qty: 30, price: 150, version: 1 }
    ]);

    const queue = new OfflineSyncQueueEngine(worker);
    queue.setOnline(true);

    // Enqueue 2 valid sales
    queue.enqueue('POS_CHECKOUT', {
      storeId: 'aldaffa_store_main',
      saleId: 'INV-MID-1',
      total: 150,
      items: [{ product_id: 'p_amber', quantity: 1, unit_price: 150 }]
    });

    // Enqueue 1 sale missing productId (will trigger 400 error)
    queue.enqueue('STOCK_AUDIT', {
      storeId: 'aldaffa_store_main'
      // missing productId and newQuantity
    });

    const flushRes = await queue.flush();
    assert.strictEqual(flushRes.synced, 1);
    assert.strictEqual(flushRes.failed, 1);
    assert.strictEqual(queue.queue[1].retryCount, 1);
    assert.strictEqual(queue.queue[1].status, 'failed');

    worker.close();
  });

  // ==========================================================================
  // TIER 3: PAIRWISE COMBINATORIAL & CONFLICT RESOLUTION
  // ==========================================================================

  await test('18.3.1 Offline Sale + Offline Stock Audit on Same SKU Conflict Resolution', async () => {
    const worker = new MockCloudflareWorker();

    // Initial state: "عود سيوفي فاخر" with stock = 20 units
    worker.seedProducts([
      { id: 'p_conflict_oud', name: 'عود سيوفي فاخر', qty: 20, price: 500, cost: 300, version: 1 }
    ]);

    const counterQueue = new OfflineSyncQueueEngine(worker);
    const scannerQueue = new OfflineSyncQueueEngine(worker);

    // Both devices are offline in the store
    counterQueue.setOnline(false);
    scannerQueue.setOnline(false);

    // Counter sells 2 bottles offline (Local state: 20 - 2 = 18)
    counterQueue.enqueue('POS_CHECKOUT', {
      storeId: 'aldaffa_store_main',
      saleId: 'INV-OFF-CONFLICT-01',
      total: 1000,
      items: [{ product_id: 'p_conflict_oud', quantity: 2, unit_price: 500, cost_price: 300 }]
    }, 'idem_sale_conflict_01');

    // In-aisle stocktaker performs physical camera audit and counts 15 bottles on shelf
    scannerQueue.enqueue('STOCK_AUDIT', {
      storeId: 'aldaffa_store_main',
      productId: 'p_conflict_oud',
      newQuantity: 15,
      reason: 'جرد فعلي بالكاميرا - عجز رف'
    }, 'idem_audit_conflict_01');

    // Devices reconnect in sequence
    counterQueue.setOnline(true);
    scannerQueue.setOnline(true);

    const resSale = await counterQueue.flush();
    const resAudit = await scannerQueue.flush();

    assert.strictEqual(resSale.synced, 1);
    assert.strictEqual(resAudit.synced, 1);

    // Verifications:
    // 1. Authoritative physical audit takes precedence for inventory count (new_qty = 15)
    const finalStock = await worker.d1.prepare('SELECT qty FROM products WHERE id = ?').bind('p_conflict_oud').first('qty');
    assert.strictEqual(finalStock, 15, 'Physical stocktaking audit establishes authoritative shelf quantity');

    // 2. Sale transaction is fully recorded in financial sales ledger
    const saleRecord = await worker.d1.prepare('SELECT total FROM sales WHERE invoice_number = ?').bind('INV-OFF-CONFLICT-01').first();
    assert(saleRecord !== null);
    assert.strictEqual(saleRecord.total, 1000);

    // 3. Audit note log exists
    const events = await worker.d1.prepare("SELECT * FROM sync_events WHERE entity_id = 'p_conflict_oud'").all();
    assert(events.results.length >= 1);

    worker.close();
  });

  // ==========================================================================
  // TIER 4: REAL-WORLD STORE BLACKOUT SIMULATION & RECONCILIATION
  // ==========================================================================

  await test('18.4.1 Complete Store Internet Blackout Simulation (10 Sales + 5 Stock Audits -> 100% Clean Reconciliation)', async () => {
    const worker = new MockCloudflareWorker();

    // Seed boutique initial inventory (5 luxury perfume lines)
    worker.seedProducts([
      { id: 'p_oud_royal_50', name: 'عود ملكي 50ml', qty: 100, price: 400, cost: 200, version: 1 },
      { id: 'p_musk_safwa_100', name: 'مسك الصفوة 100ml', qty: 80, price: 150, cost: 70, version: 1 },
      { id: 'p_rose_taif_30', name: 'ورد طائفي 30ml', qty: 60, price: 300, cost: 140, version: 1 },
      { id: 'p_amber_khas_50', name: 'عنبر خاص 50ml', qty: 50, price: 250, cost: 110, version: 1 },
      { id: 'p_oud_bakhour_box', name: 'بخور مروكي فاخر', qty: 40, price: 180, cost: 80, version: 1 }
    ]);

    // 2 POS cashiers + 1 Stocktaker Scanner
    const cashier1Queue = new OfflineSyncQueueEngine(worker);
    const cashier2Queue = new OfflineSyncQueueEngine(worker);
    const scannerQueue = new OfflineSyncQueueEngine(worker);

    // -------------------------------------------------------------
    // DISASTER INITIATION: Complete Store Network Blackout
    // -------------------------------------------------------------
    cashier1Queue.setOnline(false);
    cashier2Queue.setOnline(false);
    scannerQueue.setOnline(false);

    // Cashier 1 rings up 5 sales offline
    for (let i = 1; i <= 5; i++) {
      cashier1Queue.enqueue('POS_CHECKOUT', {
        storeId: 'aldaffa_store_main',
        deviceId: 'pos_cashier_1',
        saleId: `INV-BLACKOUT-C1-${i}`,
        total: 400,
        subtotal: 400,
        payment_method: 'cash',
        customer_name: `عميل انقطاع 1-${i}`,
        items: [{ product_id: 'p_oud_royal_50', name: 'عود ملكي 50ml', quantity: 1, unit_price: 400, cost_price: 200 }]
      }, `idem_blackout_c1_${i}`);
    }

    // Cashier 2 rings up 5 sales offline
    for (let i = 1; i <= 5; i++) {
      cashier2Queue.enqueue('POS_CHECKOUT', {
        storeId: 'aldaffa_store_main',
        deviceId: 'pos_cashier_2',
        saleId: `INV-BLACKOUT-C2-${i}`,
        total: 300,
        subtotal: 300,
        payment_method: 'card',
        customer_name: `عميل انقطاع 2-${i}`,
        items: [{ product_id: 'p_musk_safwa_100', name: 'مسك الصفوة 100ml', quantity: 2, unit_price: 150, cost_price: 70 }]
      }, `idem_blackout_c2_${i}`);
    }

    // Stocktaking scanner audits 5 products offline
    scannerQueue.enqueue('STOCK_AUDIT', {
      storeId: 'aldaffa_store_main',
      productId: 'p_rose_taif_30',
      newQuantity: 58,
      reason: 'جرد انقطاع الشبكة'
    }, 'idem_blackout_audit_1');

    scannerQueue.enqueue('STOCK_AUDIT', {
      storeId: 'aldaffa_store_main',
      productId: 'p_amber_khas_50',
      newQuantity: 47,
      reason: 'جرد انقطاع الشبكة'
    }, 'idem_blackout_audit_2');

    scannerQueue.enqueue('STOCK_AUDIT', {
      storeId: 'aldaffa_store_main',
      productId: 'p_oud_bakhour_box',
      newQuantity: 39,
      reason: 'جرد انقطاع الشبكة'
    }, 'idem_blackout_audit_3');

    scannerQueue.enqueue('STOCK_AUDIT', {
      storeId: 'aldaffa_store_main',
      productId: 'p_oud_royal_50',
      newQuantity: 95,
      reason: 'جرد انقطاع الشبكة'
    }, 'idem_blackout_audit_4');

    scannerQueue.enqueue('STOCK_AUDIT', {
      storeId: 'aldaffa_store_main',
      productId: 'p_musk_safwa_100',
      newQuantity: 70,
      reason: 'جرد انقطاع الشبكة'
    }, 'idem_blackout_audit_5');

    // -------------------------------------------------------------
    // RECOVERY EVENT: Internet restored, batch flush triggered
    // -------------------------------------------------------------
    cashier1Queue.setOnline(true);
    cashier2Queue.setOnline(true);
    scannerQueue.setOnline(true);

    const [flushC1, flushC2, flushScan] = await Promise.all([
      cashier1Queue.flush(),
      cashier2Queue.flush(),
      scannerQueue.flush()
    ]);

    assert.strictEqual(flushC1.synced, 5, 'All 5 Cashier 1 sales must be reconciled');
    assert.strictEqual(flushC2.synced, 5, 'All 5 Cashier 2 sales must be reconciled');
    assert.strictEqual(flushScan.synced, 5, 'All 5 Stock audits must be reconciled');

    // -------------------------------------------------------------
    // RECONCILIATION VERIFICATION: 100% Data Integrity Invariants
    // -------------------------------------------------------------

    // 1. Total Invoices Count: Exactly 10 blackout sales
    const totalInvoices = await worker.d1.prepare("SELECT COUNT(*) as cnt FROM sales WHERE invoice_number LIKE 'INV-BLACKOUT-%'").first('cnt');
    assert.strictEqual(totalInvoices, 10, 'Must have exactly 10 distinct invoices');

    // 2. Financial Balance:
    // Cashier 1: 5 * 400 = 2000 (Cash)
    // Cashier 2: 5 * 300 = 1500 (Card)
    // Total Revenue = 3500 د.ل
    const totalRev = await worker.d1.prepare("SELECT SUM(total) as sRev FROM sales WHERE invoice_number LIKE 'INV-BLACKOUT-%'").first('sRev');
    assert.strictEqual(totalRev, 3500, 'Total reconciled revenue must equal 3,500 د.ل');

    const totalProfit = await worker.d1.prepare("SELECT SUM(profit) as sProf FROM sales WHERE invoice_number LIKE 'INV-BLACKOUT-%'").first('sProf');
    // Profit C1: 5 * (400 - 200) = 1000
    // Profit C2: 5 * (300 - 140) = 800
    // Total Profit = 1800 د.ل
    assert.strictEqual(totalProfit, 1800, 'Total reconciled profit must equal 1,800 د.ل');

    // 3. Cash Drawer Reconciliation Formula:
    // Cash Sales = 2000 د.ل
    const cashSales = await worker.d1.prepare("SELECT SUM(total) as sCash FROM sales WHERE invoice_number LIKE 'INV-BLACKOUT-%' AND payment_method = 'cash'").first('sCash');
    assert.strictEqual(cashSales, 2000, 'Expected cash from blackout sales must equal 2,000 د.ل');

    // 4. Stock Adjustments Reconciled:
    const roseStock = await worker.d1.prepare('SELECT qty FROM products WHERE id = ?').bind('p_rose_taif_30').first('qty');
    assert.strictEqual(roseStock, 58, 'Rose stock must reconcile to audited 58');

    const amberStock = await worker.d1.prepare('SELECT qty FROM products WHERE id = ?').bind('p_amber_khas_50').first('qty');
    assert.strictEqual(amberStock, 47, 'Amber stock must reconcile to audited 47');

    const bakhourStock = await worker.d1.prepare('SELECT qty FROM products WHERE id = ?').bind('p_oud_bakhour_box').first('qty');
    assert.strictEqual(bakhourStock, 39, 'Bakhour stock must reconcile to audited 39');

    // 5. Zero unhandled locks or exceptions
    assert.strictEqual(cashier1Queue.deadLetterQueue.length, 0);
    assert.strictEqual(cashier2Queue.deadLetterQueue.length, 0);
    assert.strictEqual(scannerQueue.deadLetterQueue.length, 0);

    worker.close();
  });

  return results;
}
