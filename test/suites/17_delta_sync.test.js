import assert from 'assert';
import { createMockCloudflareWorker } from '../harness/mock-cloudflare-worker.js';

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

  const worker = createMockCloudflareWorker({
    storeId: 'aldaffa_store_main',
    storeName: 'الدفة للعطور - الفرع الرئيسي'
  });

  // Seed baseline catalog
  worker.seedProducts([
    {
      id: 'prod_oud_malaki',
      name: 'عود ملكي فاخر 100ml',
      barcode: '6281100223344',
      category: 'عطور شرقية',
      qty: 25,
      cost: 120,
      price: 250,
      wholesale_price: 200,
      unit: 'قطعة',
      version: 1
    },
    {
      id: 'prod_musk_safwa',
      name: 'مسك الصفوة الأبيض',
      barcode: '6281100334455',
      category: 'زيوت ومسك',
      qty: 40,
      cost: 45,
      price: 90,
      wholesale_price: 75,
      unit: 'تولة',
      version: 1
    }
  ]);

  await test('17.1 Initial Delta Pull Returns Baseline Product Catalog', async () => {
    const res = await worker.request('/api/v1/sync/pull?storeId=aldaffa_store_main&sinceVersion=0');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.products.length, 2);
    assert.strictEqual(res.data.products[0].barcode, '6281100223344');
    assert.strictEqual(res.data.products[0].qty, 25);
  });

  await test('17.2 Delta Push Applies Product Changes & Increments Version', async () => {
    const pushRes = await worker.request('/api/v1/sync/push', {
      method: 'POST',
      body: {
        storeId: 'aldaffa_store_main',
        deviceId: 'dev_pos_01',
        events: [
          {
            entity_type: 'product',
            entity_id: 'prod_amber_rose',
            action: 'upsert',
            payload: {
              name: 'عنبر الورد الملكي',
              barcode: '6281100445566',
              category: 'عطور غربية',
              qty: 15,
              cost: 80,
              price: 180,
              unit: 'قطعة'
            }
          }
        ]
      }
    });

    assert.strictEqual(pushRes.status, 200);
    assert.strictEqual(pushRes.data.success, true);
    assert.strictEqual(pushRes.data.syncedEventsCount, 1);
    assert(pushRes.data.currentVersion >= 1);

    // Verify product inserted in D1
    const pRow = await worker.d1.prepare('SELECT * FROM products WHERE id = ?').bind('prod_amber_rose').first();
    assert(pRow !== null);
    assert.strictEqual(pRow.name, 'عنبر الورد الملكي');
    assert.strictEqual(pRow.qty, 15);
  });

  await test('17.3 Sequence-Vector Delta Pull Only Returns Incremental Changes', async () => {
    const pullRes = await worker.request('/api/v1/sync/pull?storeId=aldaffa_store_main&sinceVersion=1');
    assert.strictEqual(pullRes.status, 200);
    assert.strictEqual(pullRes.data.success, true);
    // Only prod_amber_rose has version > 1
    assert.strictEqual(pullRes.data.products.length, 1);
    assert.strictEqual(pullRes.data.products[0].id, 'prod_amber_rose');
    assert.strictEqual(pullRes.data.sync_events.length, 1);
  });

  await test('17.4 Cloud POS Checkout Atomically Decrements D1 Inventory Stock', async () => {
    const checkoutRes = await worker.request('/api/v1/pos/checkout', {
      method: 'POST',
      body: {
        storeId: 'aldaffa_store_main',
        deviceId: 'dev_pos_01',
        saleId: 'INV-CF-001',
        total: 500,
        subtotal: 500,
        discount: 0,
        payment_method: 'cash',
        customer_name: 'عميل نقدي سحابي',
        items: [
          {
            product_id: 'prod_oud_malaki',
            name: 'عود ملكي فاخر 100ml',
            cart_qty: 2,
            final_price: 250,
            unit_cost: 120
          }
        ]
      }
    });

    assert.strictEqual(checkoutRes.status, 200);
    assert.strictEqual(checkoutRes.data.success, true);
    assert.strictEqual(checkoutRes.data.total, 500);
    assert.strictEqual(checkoutRes.data.profit, 260); // 500 - (120 * 2) = 260

    // Verify stock decreased in D1 from 25 to 23
    const prod = await worker.d1.prepare('SELECT qty FROM products WHERE id = ?').bind('prod_oud_malaki').first();
    assert.strictEqual(prod.qty, 23);

    // Verify sales row in D1
    const sale = await worker.d1.prepare('SELECT * FROM sales WHERE id = ?').bind('INV-CF-001').first();
    assert(sale !== null);
    assert.strictEqual(sale.total, 500);
    assert.strictEqual(sale.profit, 260);
  });

  await test('17.5 Idempotency Key Deduplication Prevents Double Sales Execution', async () => {
    const idempotencyKey = 'idemp_test_sale_unique_123';

    // First Call
    const res1 = await worker.request('/api/v1/pos/checkout', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: {
        storeId: 'aldaffa_store_main',
        saleId: 'INV-CF-IDEMP-01',
        total: 90,
        items: [{ product_id: 'prod_musk_safwa', cart_qty: 1, final_price: 90, unit_cost: 45 }]
      }
    });
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.data.saleId, 'INV-CF-IDEMP-01');

    const stockAfter1 = (await worker.d1.prepare('SELECT qty FROM products WHERE id = ?').bind('prod_musk_safwa').first()).qty;
    assert.strictEqual(stockAfter1, 39); // 40 - 1 = 39

    // Second Call (Duplicate retry)
    const res2 = await worker.request('/api/v1/pos/checkout', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: {
        storeId: 'aldaffa_store_main',
        saleId: 'INV-CF-IDEMP-01',
        total: 90,
        items: [{ product_id: 'prod_musk_safwa', cart_qty: 1, final_price: 90, unit_cost: 45 }]
      }
    });
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.data.saleId, 'INV-CF-IDEMP-01');

    // Stock must remain 39 (NO double deduction!)
    const stockAfter2 = (await worker.d1.prepare('SELECT qty FROM products WHERE id = ?').bind('prod_musk_safwa').first()).qty;
    assert.strictEqual(stockAfter2, 39);
  });

  await test('17.6 Camera Stocktaking Adjusts Inventory in Cloud D1', async () => {
    const adjustRes = await worker.request('/api/v1/inventory/adjust', {
      method: 'POST',
      body: {
        storeId: 'aldaffa_store_main',
        productId: 'prod_oud_malaki',
        newQuantity: 30,
        reason: 'جرد بالكاميرا - اكتشاف مخزون إضافي'
      }
    });

    assert.strictEqual(adjustRes.status, 200);
    assert.strictEqual(adjustRes.data.success, true);
    assert.strictEqual(adjustRes.data.newQuantity, 30);

    const prod = await worker.d1.prepare('SELECT qty FROM products WHERE id = ?').bind('prod_oud_malaki').first();
    assert.strictEqual(prod.qty, 30);
  });

  await test('17.7 Executive Dashboard Returns Live Aggregates with RBAC Masking', async () => {
    // 1. Manager View (Full Profit & Details)
    const mgrDash = await worker.request('/api/v1/dashboard/stats?storeId=aldaffa_store_main&role=manager');
    assert.strictEqual(mgrDash.status, 200);
    assert.strictEqual(mgrDash.data.success, true);
    assert(mgrDash.data.today_sales >= 500);
    assert(mgrDash.data.today_profit > 0);
    assert.strictEqual(mgrDash.data.masked, false);
    assert(mgrDash.data.top_perfumes.length > 0);

    // 2. Cashier View (Profits Masked)
    const cshDash = await worker.request('/api/v1/dashboard/stats?storeId=aldaffa_store_main&role=cashier');
    assert.strictEqual(cshDash.status, 200);
    assert.strictEqual(cshDash.data.success, true);
    assert(cshDash.data.today_sales >= 500);
    assert.strictEqual(cshDash.data.today_profit, null);
    assert.strictEqual(cshDash.data.masked, true);
    assert.strictEqual(cshDash.data.hourly_velocity.length, 0);
  });

  worker.close();
  return results;
}
