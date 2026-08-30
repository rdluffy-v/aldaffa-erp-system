/**
 * Suite 17: Cloudflare Delta Sync, Idempotency Deduplication & Commutative Concurrency
 * 
 * Follows 4-Tier Verification Architecture:
 * - Tier 1: Category-Partition Equivalence Paths (Pull Delta Stream, Push Batch Mutations, Sequence Vectors)
 * - Tier 2: Boundary Value Analysis & Idempotency (Duplicate Idempotency Keys, Out-of-Order Seq, Empty Streams)
 * - Tier 3: Pairwise Combinatorial & Commutative Concurrency (Multi-Device Commutative Stock Deductions)
 * - Tier 4: High-Volume Real-World Workload (50-Node Flash Sale Storm to SQLite/D1 Master)
 */

import assert from 'assert';
import { MockCloudflareWorker } from '../harness/mock-cloudflare-worker.js';

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

  await test('17.1.1 Pull Delta Stream Retrieves Initial Baseline Catalog & Sequence Vector', async () => {
    const worker = new MockCloudflareWorker();

    worker.seedProducts([
      { id: 'p_oud_01', name: 'عود كمبودي معتق', barcode: '6281001', qty: 30, price: 350, cost: 200, version: 1 },
      { id: 'p_musk_01', name: 'مسك الختام الفاخر', barcode: '6281002', qty: 50, price: 120, cost: 60, version: 1 }
    ]);

    const pullRes = await worker.request('/api/v1/sync/pull?storeId=aldaffa_store_main&sinceVersion=0');
    assert.strictEqual(pullRes.status, 200);
    assert.strictEqual(pullRes.data.success, true);
    assert.strictEqual(pullRes.data.products.length, 2);
    assert.strictEqual(pullRes.data.products[0].barcode, '6281001');
    assert.strictEqual(pullRes.data.products[0].qty, 30);
    assert.strictEqual(pullRes.data.currentVersion, 1);

    worker.close();
  });

  await test('17.1.2 Push Batch Mutations Applies Changes & Increments Sequence Vector', async () => {
    const worker = new MockCloudflareWorker();

    worker.seedProducts([
      { id: 'p_oud_01', name: 'عود كمبودي معتق', qty: 30, price: 350, version: 1 }
    ]);

    const pushRes = await worker.request('/api/v1/sync/push', {
      method: 'POST',
      body: {
        storeId: 'aldaffa_store_main',
        deviceId: 'dev_terminal_01',
        events: [
          {
            entity_type: 'product',
            entity_id: 'p_rose_taif',
            action: 'upsert',
            payload: {
              name: 'ورد طائفي نخب أول',
              barcode: '6281003',
              qty: 20,
              price: 280,
              cost: 150
            }
          },
          {
            entity_type: 'product',
            entity_id: 'p_oud_01',
            action: 'update_price',
            payload: {
              name: 'عود كمبودي معتق',
              price: 375
            }
          }
        ]
      }
    });

    assert.strictEqual(pushRes.status, 200);
    assert.strictEqual(pushRes.data.success, true);
    assert.strictEqual(pushRes.data.syncedEventsCount, 2);
    assert.strictEqual(pushRes.data.currentVersion, 3, 'Current version must increment to 3');

    // Verify D1 records
    const roseProd = await worker.d1.prepare('SELECT * FROM products WHERE id = ?').bind('p_rose_taif').first();
    assert(roseProd !== null);
    assert.strictEqual(roseProd.name, 'ورد طائفي نخب أول');
    assert.strictEqual(roseProd.price, 280);

    const updatedOud = await worker.d1.prepare('SELECT price FROM products WHERE id = ?').bind('p_oud_01').first('price');
    assert.strictEqual(updatedOud, 375);

    worker.close();
  });

  await test('17.1.3 Incremental Delta Pull Only Returns Deltas After sinceVersion', async () => {
    const worker = new MockCloudflareWorker();

    worker.seedProducts([
      { id: 'p_oud_01', name: 'عود كمبودي', qty: 30, price: 350, version: 1 }
    ]);

    // Push 1 new product (version 2)
    await worker.request('/api/v1/sync/push', {
      method: 'POST',
      body: {
        storeId: 'aldaffa_store_main',
        events: [
          {
            entity_type: 'product',
            entity_id: 'p_musk_special',
            payload: { name: 'مسك خاص', qty: 10, price: 95 }
          }
        ]
      }
    });

    // Pull with sinceVersion=1
    const deltaRes = await worker.request('/api/v1/sync/pull?storeId=aldaffa_store_main&sinceVersion=1');
    assert.strictEqual(deltaRes.status, 200);
    assert.strictEqual(deltaRes.data.success, true);
    assert.strictEqual(deltaRes.data.products.length, 1, 'Should only return product modified after version 1');
    assert.strictEqual(deltaRes.data.products[0].id, 'p_musk_special');
    assert.strictEqual(deltaRes.data.sync_events.length, 1);

    worker.close();
  });

  // ==========================================================================
  // TIER 2: BOUNDARY VALUE ANALYSIS (BVA) & IDEMPOTENCY
  // ==========================================================================

  await test('17.2.1 Duplicate Mutation Submission with Identical Idempotency Key is Idempotent', async () => {
    const worker = new MockCloudflareWorker();

    worker.seedProducts([
      { id: 'p_amber_01', name: 'عنبر ملكي 50ml', qty: 40, price: 200, cost: 100, version: 1 }
    ]);

    const idempotencyKey = 'idem_sale_tx_889977_alpha';

    const salePayload = {
      storeId: 'aldaffa_store_main',
      deviceId: 'dev_mobile_csh_1',
      idempotencyKey,
      saleId: 'INV-M-889977',
      total: 400,
      subtotal: 400,
      payment_method: 'cash',
      items: [
        { product_id: 'p_amber_01', name: 'عنبر ملكي 50ml', quantity: 2, unit_price: 200, cost_price: 100 }
      ]
    };

    // First checkout submission
    const firstRes = await worker.request('/api/v1/pos/checkout', {
      method: 'POST',
      body: salePayload
    });

    assert.strictEqual(firstRes.status, 200);
    assert.strictEqual(firstRes.data.success, true);
    assert.strictEqual(firstRes.data.saleId, 'INV-M-889977');

    // Check stock after first submission (40 - 2 = 38)
    const stockAfterFirst = await worker.d1.prepare('SELECT qty FROM products WHERE id = ?').bind('p_amber_01').first('qty');
    assert.strictEqual(stockAfterFirst, 38, 'Stock must decrease by 2 on first submission');

    // Duplicate checkout submission with SAME idempotency key (simulating mobile network retry)
    const duplicateRes = await worker.request('/api/v1/pos/checkout', {
      method: 'POST',
      body: salePayload
    });

    assert.strictEqual(duplicateRes.status, 200);
    assert.strictEqual(duplicateRes.data.success, true);
    assert.strictEqual(duplicateRes.data.saleId, 'INV-M-889977');

    // Check stock after duplicate submission: MUST STILL BE 38 (no double deduction)
    const stockAfterDuplicate = await worker.d1.prepare('SELECT qty FROM products WHERE id = ?').bind('p_amber_01').first('qty');
    assert.strictEqual(stockAfterDuplicate, 38, 'Stock must NOT be deducted twice on duplicate idempotency key');

    // Check sales table row count: MUST BE EXACTLY 1
    const salesCount = await worker.d1.prepare('SELECT COUNT(*) as cnt FROM sales WHERE invoice_number = ?').bind('INV-M-889977').first('cnt');
    assert.strictEqual(salesCount, 1, 'Must record exactly 1 invoice in database');

    worker.close();
  });

  await test('17.2.2 Out-of-Order Sequence Vector (sinceVersion > currentVersion) Returns Clean Empty Stream', async () => {
    const worker = new MockCloudflareWorker();

    worker.seedProducts([
      { id: 'p_1', name: 'عطر 1', version: 1 }
    ]);

    // Query with sinceVersion=9999 (future version)
    const res = await worker.request('/api/v1/sync/pull?storeId=aldaffa_store_main&sinceVersion=9999');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.products.length, 0, 'Must return empty product list cleanly');
    assert.strictEqual(res.data.sync_events.length, 0, 'Must return empty events list cleanly');

    worker.close();
  });

  await test('17.2.3 Empty Delta Stream when No Mutations Have Occurred', async () => {
    const worker = new MockCloudflareWorker();

    worker.seedProducts([
      { id: 'p_1', name: 'عطر 1', version: 1 }
    ]);

    // Pull at current version (1)
    const res = await worker.request('/api/v1/sync/pull?storeId=aldaffa_store_main&sinceVersion=1');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.products.length, 0);
    assert.strictEqual(res.data.sync_events.length, 0);

    worker.close();
  });

  await test('17.2.4 Empty Mutation Batch (events: []) Handles Gracefully Without Version Jump', async () => {
    const worker = new MockCloudflareWorker();

    worker.seedProducts([
      { id: 'p_1', name: 'عطر 1', version: 1 }
    ]);

    const res = await worker.request('/api/v1/sync/push', {
      method: 'POST',
      body: {
        storeId: 'aldaffa_store_main',
        events: []
      }
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.syncedEventsCount, 0);
    assert.strictEqual(res.data.currentVersion, 1, 'Version must not jump on empty batch');

    worker.close();
  });

  // ==========================================================================
  // TIER 3: PAIRWISE COMBINATORIAL & COMMUTATIVE CONCURRENCY
  // ==========================================================================

  await test('17.3.1 Concurrent Delta Push from Multiple Devices (Counters 1, 2, 3)', async () => {
    const worker = new MockCloudflareWorker();

    worker.seedProducts([
      { id: 'p_base', name: 'عطر أساسي', qty: 100, version: 1 }
    ]);

    // Simulate 3 devices pushing mutations concurrently
    const push1 = worker.request('/api/v1/sync/push', {
      method: 'POST',
      body: {
        storeId: 'aldaffa_store_main',
        deviceId: 'counter_01',
        events: [{ entity_type: 'product', entity_id: 'p_c1', payload: { name: 'عطر كاونتر 1', qty: 10, price: 100 } }]
      }
    });

    const push2 = worker.request('/api/v1/sync/push', {
      method: 'POST',
      body: {
        storeId: 'aldaffa_store_main',
        deviceId: 'counter_02',
        events: [{ entity_type: 'product', entity_id: 'p_c2', payload: { name: 'عطر كاونتر 2', qty: 20, price: 200 } }]
      }
    });

    const push3 = worker.request('/api/v1/sync/push', {
      method: 'POST',
      body: {
        storeId: 'aldaffa_store_main',
        deviceId: 'counter_03',
        events: [{ entity_type: 'product', entity_id: 'p_c3', payload: { name: 'عطر كاونتر 3', qty: 30, price: 300 } }]
      }
    });

    const [res1, res2, res3] = await Promise.all([push1, push2, push3]);

    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res3.status, 200);

    // Verify all 3 products exist in D1
    const countRow = await worker.d1.prepare("SELECT COUNT(*) as cnt FROM products WHERE id LIKE 'p_c%'").first('cnt');
    assert.strictEqual(countRow, 3, 'All 3 concurrent products must be stored');

    worker.close();
  });

  await test('17.3.2 Commutative Stock Deductions (qty = qty - sold) Converge Under Any Sync Order', async () => {
    const worker = new MockCloudflareWorker();

    // Initial stock: 100 units of "دهن عود سيوفي"
    worker.seedProducts([
      { id: 'p_oud_sayoufi', name: 'دهن عود سيوفي', qty: 100, price: 500, cost: 300, version: 1 }
    ]);

    // Device A sells 10 units
    // Device B sells 15 units
    // Device C sells 5 units
    const saleA = worker.request('/api/v1/pos/checkout', {
      method: 'POST',
      body: {
        storeId: 'aldaffa_store_main',
        deviceId: 'dev_A',
        saleId: 'INV-A-1',
        total: 5000,
        items: [{ product_id: 'p_oud_sayoufi', quantity: 10, unit_price: 500, cost_price: 300 }]
      }
    });

    const saleB = worker.request('/api/v1/pos/checkout', {
      method: 'POST',
      body: {
        storeId: 'aldaffa_store_main',
        deviceId: 'dev_B',
        saleId: 'INV-B-1',
        total: 7500,
        items: [{ product_id: 'p_oud_sayoufi', quantity: 15, unit_price: 500, cost_price: 300 }]
      }
    });

    const saleC = worker.request('/api/v1/pos/checkout', {
      method: 'POST',
      body: {
        storeId: 'aldaffa_store_main',
        deviceId: 'dev_C',
        saleId: 'INV-C-1',
        total: 2500,
        items: [{ product_id: 'p_oud_sayoufi', quantity: 5, unit_price: 500, cost_price: 300 }]
      }
    });

    const [rA, rB, rC] = await Promise.all([saleA, saleB, saleC]);
    assert.strictEqual(rA.status, 200);
    assert.strictEqual(rB.status, 200);
    assert.strictEqual(rC.status, 200);

    // Mathematical Invariant: Final Stock = 100 - 10 - 15 - 5 = 70
    const finalStock = await worker.d1.prepare('SELECT qty FROM products WHERE id = ?').bind('p_oud_sayoufi').first('qty');
    assert.strictEqual(finalStock, 70, 'Final stock must mathematically converge to exactly 70');

    // Total sales revenue = 5000 + 7500 + 2500 = 15000
    const totalRev = await worker.d1.prepare('SELECT SUM(total) as sumRev FROM sales').first('sumRev');
    assert.strictEqual(totalRev, 15000);

    worker.close();
  });

  await test('17.3.3 Fractional Portion (ML) Commutative Stock Deductions Precision', async () => {
    const worker = new MockCloudflareWorker();

    // 1000ml bulk perfume bottle
    worker.seedProducts([
      { id: 'p_bulk_musk_1000', name: 'زيت مسك خام 1000ml', qty: 1000, price: 5, cost: 2, version: 1 }
    ]);

    // 3 concurrent sales of 12.5ml, 37.5ml, and 50ml
    await Promise.all([
      worker.request('/api/v1/pos/checkout', {
        method: 'POST',
        body: {
          storeId: 'aldaffa_store_main',
          saleId: 'INV-ML-001',
          total: 62.5,
          items: [{ product_id: 'p_bulk_musk_1000', quantity: 12.5, unit_price: 5, portion_ml: 12.5 }]
        }
      }),
      worker.request('/api/v1/pos/checkout', {
        method: 'POST',
        body: {
          storeId: 'aldaffa_store_main',
          saleId: 'INV-ML-002',
          total: 187.5,
          items: [{ product_id: 'p_bulk_musk_1000', quantity: 37.5, unit_price: 5, portion_ml: 37.5 }]
        }
      }),
      worker.request('/api/v1/pos/checkout', {
        method: 'POST',
        body: {
          storeId: 'aldaffa_store_main',
          saleId: 'INV-ML-003',
          total: 250,
          items: [{ product_id: 'p_bulk_musk_1000', quantity: 50.0, unit_price: 5, portion_ml: 50.0 }]
        }
      })
    ]);

    // Final stock = 1000 - 12.5 - 37.5 - 50 = 900ml
    const finalStock = await worker.d1.prepare('SELECT qty FROM products WHERE id = ?').bind('p_bulk_musk_1000').first('qty');
    assert.strictEqual(finalStock, 900, 'Fractional portion deductions must maintain exact decimal precision');

    worker.close();
  });

  // ==========================================================================
  // TIER 4: REAL-WORLD HIGH-VOLUME FLASH SALE WORKLOAD
  // ==========================================================================

  await test('17.4.1 High-Volume Flash Sale Scenario (50 Mobile Transactions Synced Concurrently)', async () => {
    const worker = new MockCloudflareWorker();

    // Initial Flash Sale Fragrance: 500 units in stock
    worker.seedProducts([
      { id: 'p_flash_perfume', name: 'عطر العيد المحدود (Flash Sale)', qty: 500, price: 100, cost: 40, version: 1 }
    ]);

    const numTransactions = 50;
    const promises = [];

    for (let i = 1; i <= numTransactions; i++) {
      const deviceId = `mobile_pos_${(i % 5) + 1}`; // 5 mobile devices
      const salePromise = worker.request('/api/v1/pos/checkout', {
        method: 'POST',
        body: {
          storeId: 'aldaffa_store_main',
          deviceId,
          idempotencyKey: `flash_idem_${i}_${Date.now()}`,
          saleId: `INV-FLASH-${String(i).padStart(4, '0')}`,
          total: 200, // 2 bottles per sale
          subtotal: 200,
          payment_method: i % 2 === 0 ? 'cash' : 'card',
          customer_name: `عميل عروض ${i}`,
          items: [
            {
              product_id: 'p_flash_perfume',
              name: 'عطر العيد المحدود (Flash Sale)',
              quantity: 2,
              unit_price: 100,
              cost_price: 40
            }
          ]
        }
      });
      promises.push(salePromise);
    }

    const responses = await Promise.all(promises);

    // Verify all 50 sales succeeded
    for (let i = 0; i < responses.length; i++) {
      const res = responses[i];
      assert.strictEqual(res.status, 200, `Transaction ${i + 1} must return HTTP 200`);
      assert.strictEqual(res.data.success, true, `Transaction ${i + 1} must succeed`);
    }

    // Verify exact stock reduction: 500 - (50 * 2) = 400
    const remainingStock = await worker.d1.prepare('SELECT qty FROM products WHERE id = ?').bind('p_flash_perfume').first('qty');
    assert.strictEqual(remainingStock, 400, 'Stock must decrease by exactly 100 bottles across 50 sales');

    // Verify 50 distinct invoice records
    const countSales = await worker.d1.prepare("SELECT COUNT(*) as cnt FROM sales WHERE invoice_number LIKE 'INV-FLASH-%'").first('cnt');
    assert.strictEqual(countSales, 50, 'All 50 invoices must be recorded without loss or concurrency collisions');

    // Verify revenue aggregation: 50 sales * 200 = 10,000 د.ل
    const totalRev = await worker.d1.prepare("SELECT SUM(total) as sRev FROM sales WHERE invoice_number LIKE 'INV-FLASH-%'").first('sRev');
    assert.strictEqual(totalRev, 10000, 'Total flash sale revenue must equal 10,000');

    // Verify profit aggregation: 50 sales * (200 - 80) = 6,000 د.ل
    const totalProfit = await worker.d1.prepare("SELECT SUM(profit) as sProf FROM sales WHERE invoice_number LIKE 'INV-FLASH-%'").first('sProf');
    assert.strictEqual(totalProfit, 6000, 'Total flash sale gross profit must equal 6,000');

    worker.close();
  });

  return results;
}
