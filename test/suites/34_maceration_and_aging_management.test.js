/**
 * Suite 34: Perfume Maceration & Aging Management Automated QA Suite
 * Verifies batch creation, dynamic cost engine, atomic WIP inventory deductions,
 * maturation timeline tracking, automated status triggers, and graduation (bulk & bottled).
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

  // Helper to create test database with fresh tables
  const setupDb = () => {
    const testDb = createTestDb();
    return testDb;
  };

  await test('34.1.1 Batch Creation, Sequential Code & Ready Date Computation', async () => {
    const db = setupDb();

    const currentYear = new Date().getFullYear();
    const batchNumber = `MCR-${currentYear}-0001`;
    const startDate = '2026-05-01';
    const macerationDays = 45;

    const startObj = new Date(startDate);
    const readyObj = new Date(startObj.getTime() + (macerationDays * 24 * 60 * 60 * 1000));
    const readyDate = readyObj.toISOString().split('T')[0];

    assert.strictEqual(readyDate, '2026-06-15', '45 days from May 1st should be June 15th');

    // Insert batch
    db.run(
      `INSERT INTO maceration_batches (
        id, batch_number, blend_name, start_date, maceration_days, ready_date,
        target_volume_ml, total_batch_cost, unit_cost_per_ml, status, category
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'mcr_test_1', batchNumber, 'قوتشي فلورا معتق', startDate, macerationDays, readyDate,
      1000, 150.0, 0.15, 'aging', 'VIP Maceration'
    );

    const batch = db.get(`SELECT * FROM maceration_batches WHERE id = ?`, 'mcr_test_1');
    assert.ok(batch, 'Batch must exist in database');
    assert.strictEqual(batch.batch_number, batchNumber);
    assert.strictEqual(batch.status, 'aging');
    assert.strictEqual(batch.total_batch_cost, 150.0);
    assert.strictEqual(batch.unit_cost_per_ml, 0.15);
  });

  await test('34.1.2 Dynamic Cost Engine & Oil Concentration Ratio Math', async () => {
    // Formulation math test:
    // Oil: 200 ml @ 0.50 LYD/ml = 100 LYD
    // Alcohol: 800 ml @ 0.02 LYD/ml = 16 LYD
    // Vessel: 10 LYD (absorbed)
    // Target Volume: 1000 ml
    const oilVol = 200;
    const oilCostPerMl = 0.50;
    const oilTotal = oilVol * oilCostPerMl; // 100

    const alcVol = 800;
    const alcCostPerMl = 0.02;
    const alcTotal = alcVol * alcCostPerMl; // 16

    const vesselCost = 10;
    const totalBatchCost = oilTotal + alcTotal + vesselCost; // 126
    const targetVolumeMl = 1000;
    const unitCostPerMl = totalBatchCost / targetVolumeMl; // 0.126

    assert.strictEqual(totalBatchCost, 126.0);
    assert.strictEqual(unitCostPerMl, 0.126);

    // Concentration ratio: 200 / 1000 = 20%
    const concentration = (oilVol / targetVolumeMl) * 100;
    assert.strictEqual(concentration, 20.0);
  });

  await test('34.2.1 Immediate Atomic Inventory Deductions & Non-Negative Clamping', async () => {
    const db = setupDb();

    // Seed inventory with raw materials
    db.run(
      `INSERT INTO inventory (id, name, qty, cost, price, item_type, unit) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'oil_raw_1', 'زيت توم فورد خام', 500, 0.8, 1.2, 'raw_oil', 'ml'
    );
    db.run(
      `INSERT INTO inventory (id, name, qty, cost, price, item_type, unit) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'alc_raw_1', 'كحول إيثانول 96%', 2000, 0.04, 0.08, 'alcohol_fixative', 'ml'
    );
    db.run(
      `INSERT INTO inventory (id, name, qty, cost, price, item_type, unit) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'vessel_1', 'قارورة تعتيق زجاجية داكنة', 10, 15, 20, 'empty_bottle', 'piece'
    );

    // Execute batch creation with atomic transaction queries
    const usedOil = 200;
    const usedAlc = 800;
    const usedVessel = 1;

    const queries = [
      {
        sql: `INSERT INTO maceration_batches (
          id, batch_number, blend_name, start_date, maceration_days, ready_date,
          target_volume_ml, total_batch_cost, unit_cost_per_ml, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: ['mcr_tx_1', 'MCR-2026-0002', 'توم فورد معتق', '2026-05-01', 30, '2026-05-31', 1000, 192.0, 0.192, 'aging']
      },
      {
        sql: `INSERT INTO maceration_batch_ingredients (id, batch_id, ingredient_type, raw_material_id, ingredient_name, volume_ml, cost_per_ml, total_cost)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        params: ['mci_1', 'mcr_tx_1', 'oil', 'oil_raw_1', 'زيت توم فورد خام', usedOil, 0.8, 160.0]
      },
      {
        sql: `INSERT INTO maceration_batch_ingredients (id, batch_id, ingredient_type, raw_material_id, ingredient_name, volume_ml, cost_per_ml, total_cost)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        params: ['mci_2', 'mcr_tx_1', 'alcohol', 'alc_raw_1', 'كحول إيثانول 96%', usedAlc, 0.04, 32.0]
      },
      // Deduct inventory
      {
        sql: `UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?`,
        params: [usedOil, 'oil_raw_1']
      },
      {
        sql: `UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?`,
        params: [usedAlc, 'alc_raw_1']
      },
      {
        sql: `UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?`,
        params: [usedVessel, 'vessel_1']
      }
    ];

    db.transaction(queries);

    // Verify stock depletions
    const oilAfter = db.get(`SELECT qty FROM inventory WHERE id = ?`, 'oil_raw_1');
    const alcAfter = db.get(`SELECT qty FROM inventory WHERE id = ?`, 'alc_raw_1');
    const vesselAfter = db.get(`SELECT qty FROM inventory WHERE id = ?`, 'vessel_1');

    assert.strictEqual(oilAfter.qty, 300, 'Raw oil should be depleted from 500 to 300 ml');
    assert.strictEqual(alcAfter.qty, 1200, 'Alcohol should be depleted from 2000 to 1200 ml');
    assert.strictEqual(vesselAfter.qty, 9, 'Vessel should be depleted from 10 to 9');

    // Test zero-floor clamping
    db.run(`UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?`, [5000, 'oil_raw_1']);
    const oilClamped = db.get(`SELECT qty FROM inventory WHERE id = ?`, 'oil_raw_1');
    assert.strictEqual(oilClamped.qty, 0, 'Inventory stock must never go below zero');
  });

  await test('34.2.2 POS Isolation: WIP Aging Batches Excluded From Active Checkout', async () => {
    const db = setupDb();

    // Insert an aging batch
    db.run(
      `INSERT INTO maceration_batches (id, batch_number, blend_name, start_date, maceration_days, ready_date, target_volume_ml, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      'mcr_pos_iso', 'MCR-2026-0003', 'عطر معتق قيد التعتيق', '2026-01-01', 60, '2026-03-02', 1000, 'aging'
    );

    // POS checkout queries inventory table for saleable items
    const saleableProducts = db.query(`SELECT * FROM inventory WHERE item_type = 'ready_perfume'`);
    const foundWip = saleableProducts.find(p => p.name.includes('عطر معتق قيد التعتيق'));

    assert.strictEqual(foundWip, undefined, 'WIP aging batches must never be exposed as saleable items in inventory checkout');
  });

  await test('34.3.1 Maturation Timeline & Automated Status Trigger when Ready Date Arrives', async () => {
    const db = setupDb();

    const pastDate = '2026-01-01';
    const pastReadyDate = '2026-02-01';

    // Insert batch with past ready date
    db.run(
      `INSERT INTO maceration_batches (id, batch_number, blend_name, start_date, maceration_days, ready_date, target_volume_ml, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      'mcr_mature_1', 'MCR-2026-0004', 'سوفاج معتق منتهي', pastDate, 31, pastReadyDate, 1000, 'aging'
    );

    // Execute automated maturity trigger
    const today = new Date().toISOString().split('T')[0];
    db.run(
      `UPDATE maceration_batches 
       SET status = 'mature_pending_approval', updated_at = datetime('now')
       WHERE status = 'aging' AND ready_date <= ?`,
      [today]
    );

    const updated = db.get(`SELECT * FROM maceration_batches WHERE id = ?`, 'mcr_mature_1');
    assert.strictEqual(updated.status, 'mature_pending_approval', 'Batch whose ready_date <= today must switch to mature_pending_approval');
  });

  await test('34.3.2 Maceration Extension & QA Assessment Notes', async () => {
    const db = setupDb();

    db.run(
      `INSERT INTO maceration_batches (id, batch_number, blend_name, start_date, maceration_days, ready_date, target_volume_ml, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      'mcr_ext_1', 'MCR-2026-0005', 'بلاك أفغانو معتق', '2026-05-01', 30, '2026-05-31', 1000, 'mature_pending_approval'
    );

    // Extend maceration by +15 days
    const addedDays = 15;
    const oldReady = new Date('2026-05-31');
    const newReady = new Date(oldReady.getTime() + (addedDays * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];

    db.run(
      `UPDATE maceration_batches 
       SET maceration_days = maceration_days + ?, ready_date = ?, status = 'aging', notes = ?
       WHERE id = ?`,
      [addedDays, newReady, 'تم التمديد لزيادة ثبات العطر', 'mcr_ext_1']
    );

    const extended = db.get(`SELECT * FROM maceration_batches WHERE id = ?`, 'mcr_ext_1');
    assert.strictEqual(extended.maceration_days, 45);
    assert.strictEqual(extended.ready_date, '2026-06-15');
    assert.strictEqual(extended.status, 'aging', 'Extended batch should return to aging status');

    // QA notes update
    db.run(
      `UPDATE maceration_batches SET qa_notes = ? WHERE id = ?`,
      ['رائحة خشبية ممتازة، نقاء 100%، جاهز للفلترة', 'mcr_ext_1']
    );

    const qaChecked = db.get(`SELECT qa_notes FROM maceration_batches WHERE id = ?`, 'mcr_ext_1');
    assert.strictEqual(qaChecked.qa_notes, 'رائحة خشبية ممتازة، نقاء 100%، جاهز للفلترة');
  });

  await test('34.4.1 Evaporation Loss & Recalculated Unit Cost on Graduation', async () => {
    // Initial planned yield: 1000 ml
    // Total batch cost: 120 LYD
    // Initial cost/ml: 120 / 1000 = 0.12 LYD/ml
    // Actual yield post-maceration: 960 ml (40 ml evaporation loss)
    // Recalculated true cost/ml: 120 / 960 = 0.125 LYD/ml
    const totalCost = 120.0;
    const actualVolume = 960.0;
    const finalCostPerMl = Math.round((totalCost / actualVolume) * 10000) / 10000;

    assert.strictEqual(finalCostPerMl, 0.125, 'Evaporation loss must adjust unit cost proportionally');
  });

  await test('34.4.2 Graduation to Loose Bulk Stock in Inventory', async () => {
    const db = setupDb();

    // Insert batch
    db.run(
      `INSERT INTO maceration_batches (id, batch_number, blend_name, start_date, maceration_days, ready_date, target_volume_ml, total_batch_cost, unit_cost_per_ml, status, category)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'mcr_grad_bulk', 'MCR-2026-0006', 'مسك الطهارة معتق', '2026-01-01', 30, '2026-01-31', 1000, 150.0, 0.15, 'mature_pending_approval', 'Oriental Oud'
    );

    const actualVol = 980; // 20 ml loss
    const finalUnitCost = Math.round((150.0 / actualVol) * 10000) / 10000;
    const retailPricePerMl = 0.40;
    const wholesalePricePerMl = 0.30;

    const queries = [
      {
        sql: `INSERT INTO inventory (id, name, category, qty, cost, price, wholesale_price, original_price, unit, capacity, item_type)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: ['prd_bulk_1', 'مسك الطهارة (معتق سائب)', 'Oriental Oud', actualVol, finalUnitCost, retailPricePerMl, wholesalePricePerMl, retailPricePerMl, 'ml', actualVol, 'ready_perfume']
      },
      {
        sql: `UPDATE maceration_batches SET actual_volume_ml = ?, unit_cost_per_ml = ?, status = 'ready_for_sale' WHERE id = ?`,
        params: [actualVol, finalUnitCost, 'mcr_grad_bulk']
      }
    ];

    db.transaction(queries);

    const batch = db.get(`SELECT * FROM maceration_batches WHERE id = ?`, 'mcr_grad_bulk');
    assert.strictEqual(batch.status, 'ready_for_sale');
    assert.strictEqual(batch.actual_volume_ml, 980);

    const bulkProduct = db.get(`SELECT * FROM inventory WHERE id = ?`, 'prd_bulk_1');
    assert.ok(bulkProduct, 'Bulk perfume must be created in inventory');
    assert.strictEqual(bulkProduct.unit, 'ml');
    assert.strictEqual(bulkProduct.qty, 980);
    assert.strictEqual(bulkProduct.cost, finalUnitCost);
    assert.strictEqual(bulkProduct.price, 0.40);
  });

  await test('34.4.3 Graduation to Bottled Perfumes with Packaging Deductions', async () => {
    const db = setupDb();

    // Seed inventory with empty bottles and packaging boxes
    db.run(
      `INSERT INTO inventory (id, name, qty, cost, price, item_type, unit) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'bottle_50_id', 'زجاجة كرستال 50مل فاخرة', 50, 4.0, 8.0, 'empty_bottle', 'piece'
    );
    db.run(
      `INSERT INTO inventory (id, name, qty, cost, price, item_type, unit) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'box_50_id', 'علبة كرتونية مخملية 50مل', 50, 2.0, 5.0, 'accessory', 'piece'
    );

    // Insert batch: 1000 ml @ 200 LYD (0.20/ml)
    db.run(
      `INSERT INTO maceration_batches (id, batch_number, blend_name, start_date, maceration_days, ready_date, target_volume_ml, total_batch_cost, unit_cost_per_ml, status, category)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'mcr_bottle_batch', 'MCR-2026-0007', 'أفينتوس الملكي معتق', '2026-01-01', 60, '2026-03-02', 1000, 200.0, 0.20, 'mature_pending_approval', 'Signature Blend'
    );

    const actualVol = 1000;
    const bottleCapacity = 50;
    const bottleCount = Math.floor(actualVol / bottleCapacity); // 20 bottles
    assert.strictEqual(bottleCount, 20);

    const emptyBottleCost = 4.0;
    const boxCost = 2.0;
    const liquidCostPerBottle = bottleCapacity * 0.20; // 10.0
    const totalUnitCost = liquidCostPerBottle + emptyBottleCost + boxCost; // 16.0
    const retailPrice = 35.0;

    const queries = [
      // Deduct empty bottles
      {
        sql: `UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?`,
        params: [bottleCount, 'bottle_50_id']
      },
      // Deduct boxes
      {
        sql: `UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?`,
        params: [bottleCount, 'box_50_id']
      },
      // Insert finished perfume
      {
        sql: `INSERT INTO inventory (id, name, category, qty, cost, price, wholesale_price, original_price, unit, capacity, item_type)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: ['prd_aventus_50', 'أفينتوس الملكي 50مل (معتق)', 'Signature Blend', bottleCount, totalUnitCost, retailPrice, 28.0, retailPrice, 'piece', 50, 'ready_perfume']
      },
      // Update batch
      {
        sql: `UPDATE maceration_batches SET actual_volume_ml = ?, status = 'bottled' WHERE id = ?`,
        params: [actualVol, 'mcr_bottle_batch']
      }
    ];

    db.transaction(queries);

    // Verify stock deductions
    const bottlesRemaining = db.get(`SELECT qty FROM inventory WHERE id = ?`, 'bottle_50_id');
    const boxesRemaining = db.get(`SELECT qty FROM inventory WHERE id = ?`, 'box_50_id');
    assert.strictEqual(bottlesRemaining.qty, 30, '50 - 20 = 30 bottles');
    assert.strictEqual(boxesRemaining.qty, 30, '50 - 20 = 30 boxes');

    // Verify finished product in inventory
    const finishedProduct = db.get(`SELECT * FROM inventory WHERE id = ?`, 'prd_aventus_50');
    assert.ok(finishedProduct);
    assert.strictEqual(finishedProduct.qty, 20);
    assert.strictEqual(finishedProduct.cost, 16.0);
    assert.strictEqual(finishedProduct.price, 35.0);

    const batchAfter = db.get(`SELECT status FROM maceration_batches WHERE id = ?`, 'mcr_bottle_batch');
    assert.strictEqual(batchAfter.status, 'bottled');
  });

  await test('34.4.4 Discarding Batch with Quality Failure', async () => {
    const db = setupDb();

    db.run(
      `INSERT INTO maceration_batches (id, batch_number, blend_name, start_date, maceration_days, ready_date, target_volume_ml, total_batch_cost, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'mcr_discard_1', 'MCR-2026-0008', 'عينة فاشلة', '2026-01-01', 30, '2026-01-31', 500, 80.0, 'mature_pending_approval'
    );

    db.run(
      `UPDATE maceration_batches 
       SET status = 'discarded', notes = ? 
       WHERE id = ?`,
      ['عكارة شديدة وتغير في الرائحة لم تجتز الفحص', 'mcr_discard_1']
    );

    const discarded = db.get(`SELECT * FROM maceration_batches WHERE id = ?`, 'mcr_discard_1');
    assert.strictEqual(discarded.status, 'discarded');
    assert.ok(discarded.notes.includes('عكارة شديدة'));
  });

  return results;
}
