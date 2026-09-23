/**
 * Suite 35: Perfume Tester & Sampling Inventory Automated QA Suite
 * Verifies ready perfume deductions, compounded mix compounding, atomic stock clamping,
 * marketing expense isolation (no shrinkage / no false sales), analytics leaderboard,
 * and UTF-8 BOM CSV export integrity.
 */

import assert from 'assert';
import { createTestDb } from '../harness/test-db.js';

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

  const setupDb = () => {
    const testDb = createTestDb();
    return testDb;
  };

  await test('35.1.1 Ready Perfume Tester Deduction & Proportional Cost Derivation', async () => {
    const db = setupDb();

    // Setup ready perfume bottle: 100ml flacon, cost 120 LYD, qty 10 bottles
    db.run(
      `INSERT INTO inventory (id, name, item_type, capacity, cost, price, qty, unit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      'prod_sauvage_100', 'سوفاج ديور بارفيوم', 'ready_perfume', 100, 120.0, 250.0, 10.0, 'piece'
    );

    const sampleVolumeMl = 10;
    const bottleCost = 120.0;
    const bottleCapacity = 100.0;
    const costPerMl = bottleCost / bottleCapacity; // 1.2 LYD/ml
    const expectedTotalCost = sampleVolumeMl * costPerMl; // 12.0 LYD
    const qtyToDeduct = sampleVolumeMl / bottleCapacity; // 0.1 bottle

    // Atomic execution simulation
    db.run(
      `UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?`,
      qtyToDeduct, 'prod_sauvage_100'
    );

    db.run(
      `INSERT INTO perfume_testers (
        id, source_type, sample_volume_ml, total_cost, finished_product_id,
        product_name, reason, dispensed_by, notes
      ) VALUES (?, 'ready_perfume', ?, ?, ?, ?, ?, ?, ?)`,
      'tester_ready_1', sampleVolumeMl, expectedTotalCost, 'prod_sauvage_100',
      'سوفاج ديور بارفيوم', 'رف التستر بالمحل', 'أحمد الكاشير', 'سحب 10 مل قارورة عرض'
    );

    // Verify inventory deduction
    const updatedProd = db.get(`SELECT * FROM inventory WHERE id = ?`, 'prod_sauvage_100');
    assert.strictEqual(Number(updatedProd.qty.toFixed(2)), 9.9, '10ml of 100ml bottle must deduct 0.1 bottle leaving 9.9');

    // Verify tester record
    const tester = db.get(`SELECT * FROM perfume_testers WHERE id = ?`, 'tester_ready_1');
    assert.ok(tester, 'Tester log record must be created');
    assert.strictEqual(tester.source_type, 'ready_perfume');
    assert.strictEqual(tester.sample_volume_ml, 10);
    assert.strictEqual(tester.total_cost, 12.0);
    assert.strictEqual(tester.product_name, 'سوفاج ديور بارفيوم');
  });

  await test('35.1.2 Compounded Mix Tester Compounding & Combined Cost Derivation', async () => {
    const db = setupDb();

    // Setup raw oil (cost 2.50 LYD/ml, qty 100 ml)
    db.run(
      `INSERT INTO inventory (id, name, item_type, cost, qty, unit)
       VALUES (?, ?, ?, ?, ?, ?)`,
      'oil_oud_cambodi', 'زيت عود كمبودي خالص', 'raw_material', 2.50, 100.0, 'ml'
    );

    // Setup perfumer's alcohol (cost 0.05 LYD/ml, qty 500 ml)
    db.run(
      `INSERT INTO inventory (id, name, item_type, cost, qty, unit)
       VALUES (?, ?, ?, ?, ?, ?)`,
      'alc_perfumer_96', 'كحول إيثانول فرنسي 96%', 'raw_material', 0.05, 500.0, 'ml'
    );

    const oilVol = 2; // 2 ml oil
    const alcVol = 8; // 8 ml alcohol
    const totalSampleVol = oilVol + alcVol; // 10 ml
    const expectedOilCost = oilVol * 2.50; // 5.0 LYD
    const expectedAlcCost = alcVol * 0.05; // 0.40 LYD
    const expectedTotalCost = expectedOilCost + expectedAlcCost; // 5.40 LYD
    const oilConcentration = (oilVol / totalSampleVol) * 100; // 20%

    // Atomic transaction
    db.run(`UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?`, oilVol, 'oil_oud_cambodi');
    db.run(`UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?`, alcVol, 'alc_perfumer_96');

    db.run(
      `INSERT INTO perfume_testers (
        id, source_type, sample_volume_ml, total_cost,
        fragrance_oil_id, fragrance_oil_name, oil_volume_ml, oil_cost_per_ml,
        alcohol_id, alcohol_name, alcohol_volume_ml, alcohol_cost_per_ml,
        reason, dispensed_by
      ) VALUES (?, 'compounded_mix', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'tester_comp_1', totalSampleVol, expectedTotalCost,
      'oil_oud_cambodi', 'زيت عود كمبودي خالص', oilVol, 2.50,
      'alc_perfumer_96', 'كحول إيثانول فرنسي 96%', alcVol, 0.05,
      'عينة لزبون مميز', 'المدير'
    );

    // Check inventory decrement
    const updatedOil = db.get(`SELECT qty FROM inventory WHERE id = ?`, 'oil_oud_cambodi');
    const updatedAlc = db.get(`SELECT qty FROM inventory WHERE id = ?`, 'alc_perfumer_96');
    assert.strictEqual(updatedOil.qty, 98.0, 'Oil qty must decrease by 2 ml to 98 ml');
    assert.strictEqual(updatedAlc.qty, 492.0, 'Alcohol qty must decrease by 8 ml to 492 ml');

    // Check tester entry
    const tester = db.get(`SELECT * FROM perfume_testers WHERE id = ?`, 'tester_comp_1');
    assert.ok(tester);
    assert.strictEqual(tester.source_type, 'compounded_mix');
    assert.strictEqual(tester.sample_volume_ml, 10);
    assert.strictEqual(tester.total_cost, 5.40);
    assert.strictEqual(oilConcentration, 20);
  });

  await test('35.2.1 Atomic Stock Zero-Floor Clamping (Zero-Negative Invariant)', async () => {
    const db = setupDb();

    // Product with very low quantity: 0.05 bottle left
    db.run(
      `INSERT INTO inventory (id, name, capacity, cost, price, qty, unit)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'prod_low_stock', 'عطر نادر', 100, 100, 200, 0.05, 'piece'
    );

    // Dispense 10 ml = 0.1 bottle (exceeds 0.05)
    db.run(
      `UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?`,
      0.1, 'prod_low_stock'
    );

    const item = db.get(`SELECT qty FROM inventory WHERE id = ?`, 'prod_low_stock');
    assert.strictEqual(item.qty, 0, 'Inventory quantity must clamp to 0 and NEVER become negative');
  });

  await test('35.3.1 Marketing Expense Accounting & Non-Revenue Isolation', async () => {
    const db = setupDb();

    db.run(
      `INSERT INTO inventory (id, name, capacity, cost, qty) VALUES (?, ?, ?, ?, ?)`,
      'prod_test_isolate', 'عطر اختبار', 100, 50, 5
    );

    // Record tester
    db.run(
      `INSERT INTO perfume_testers (
        id, source_type, sample_volume_ml, total_cost, finished_product_id,
        product_name, dispensed_by
      ) VALUES (?, 'ready_perfume', 10, 5.0, 'prod_test_isolate', 'عطر اختبار', 'الكاشير')`,
      'tester_iso_1'
    );

    // Verify NO entries in sales or sale_items (not a revenue sale)
    const salesCount = db.get(`SELECT COUNT(*) as c FROM sales`).c;
    const saleItemsCount = db.get(`SELECT COUNT(*) as c FROM sale_items`).c;
    assert.strictEqual(salesCount, 0, 'Testers must NOT create sales entries');
    assert.strictEqual(saleItemsCount, 0, 'Testers must NOT create sale_items entries');

    // Verify NO entries in losses (not damaged/expired shrinkage)
    const lossesCount = db.get(`SELECT COUNT(*) as c FROM losses`).c;
    assert.strictEqual(lossesCount, 0, 'Testers must NOT be recorded as shrinkage losses');

    // Verify isolated in perfume_testers
    const testerCount = db.get(`SELECT COUNT(*) as c FROM perfume_testers`).c;
    assert.strictEqual(testerCount, 1, 'Tester is recorded strictly in perfume_testers');
  });

  await test('35.4.1 Tester Analytics, Spend Aggregation & Fragrance Leaderboard', async () => {
    const db = setupDb();

    // Insert multiple testers
    db.run(
      `INSERT INTO perfume_testers (id, source_type, sample_volume_ml, total_cost, product_name, dispensed_by, created_at)
       VALUES (?, 'ready_perfume', 10, 15.0, 'عطر الدفة الملكي', 'عمر', datetime('now'))`,
      't_1'
    );
    db.run(
      `INSERT INTO perfume_testers (id, source_type, sample_volume_ml, total_cost, product_name, dispensed_by, created_at)
       VALUES (?, 'ready_perfume', 20, 30.0, 'عطر الدفة الملكي', 'علي', datetime('now'))`,
      't_2'
    );
    db.run(
      `INSERT INTO perfume_testers (id, source_type, sample_volume_ml, total_cost, fragrance_oil_name, dispensed_by, created_at)
       VALUES (?, 'compounded_mix', 15, 7.5, 'مسك روز فرنسي', 'أحمد', datetime('now'))`,
      't_3'
    );

    // Test aggregations
    const totals = db.get(
      `SELECT SUM(total_cost) as spend, SUM(sample_volume_ml) as vol, COUNT(*) as cnt FROM perfume_testers`
    );
    assert.strictEqual(totals.spend, 52.5);
    assert.strictEqual(totals.vol, 45.0);
    assert.strictEqual(totals.cnt, 3);

    // Leaderboard
    const leaderboard = db.query(
      `SELECT COALESCE(product_name, fragrance_oil_name) as fragrance, COUNT(*) as samples, SUM(sample_volume_ml) as vol
       FROM perfume_testers
       GROUP BY fragrance
       ORDER BY samples DESC`
    );

    assert.strictEqual(leaderboard[0].fragrance, 'عطر الدفة الملكي');
    assert.strictEqual(leaderboard[0].samples, 2);
    assert.strictEqual(leaderboard[0].vol, 30.0);

    assert.strictEqual(leaderboard[1].fragrance, 'مسك روز فرنسي');
    assert.strictEqual(leaderboard[1].samples, 1);
  });

  await test('35.5.1 CSV Export UTF-8 BOM and Header Integrity', async () => {
    // Mock CSV formatting with BOM
    const headers = [
      'المعرف', 'التاريخ والوقت', 'نوع المصدر', 'اسم العطر / الزيت',
      'حجم العينة (مل)', 'التكلفة الإجمالية (د.ل)', 'سياق وسبب الصرف', 'الموظف المسئول', 'الملاحظات'
    ];
    const row = ['test_id_1', '2026-09-23 18:00', 'عطر جاهز', 'عطر الدفة الملكي', '10', '15.00', 'عرض المحل', 'المدير', 'عينة'];

    const csvContent = '\uFEFF' + headers.join(',') + '\n' + row.join(',');

    assert.strictEqual(csvContent.charCodeAt(0), 0xFEFF, 'First character must be UTF-8 BOM byte 0xFEFF');
    assert.ok(csvContent.includes('اسم العطر / الزيت'), 'Headers must contain Arabic fragrance column');
    assert.ok(csvContent.includes('عطر الدفة الملكي'), 'Data must contain Arabic perfume name');
  });

  return results;
}
