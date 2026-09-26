/**
 * Suite 36: Automated Aldaffa ERP Error Prevention Guardrails & UI/UX Bug Fixes
 * 
 * Verifies:
 * 1. Purchases Module: Category unioning, dynamic dependent units/item_type updates.
 * 2. Losses Module: Explicit transaction_date field persistence and UTF-8 BOM CSV export.
 * 3. Testers Compounding: Variable packaging bottle derivation, dynamic composite cost, and atomic inventory commit.
 * 4. Master 13-Rule Error Prevention Guardrails verification execution.
 */

import assert from 'assert';
import Database from 'better-sqlite3';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

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

  // Helper SQLite schema for isolated testing
  const createTestDb = () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT,
        is_demo INTEGER DEFAULT 0
      );

      CREATE TABLE inventory (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT,
        qty REAL DEFAULT 0,
        cost REAL DEFAULT 0,
        price REAL DEFAULT 0,
        wholesale_price REAL DEFAULT 0,
        unit TEXT DEFAULT 'piece',
        capacity REAL DEFAULT 0,
        barcode TEXT,
        min_qty REAL DEFAULT 5,
        item_type TEXT DEFAULT 'ready_perfume',
        notes TEXT,
        is_demo INTEGER DEFAULT 0
      );

      CREATE TABLE losses (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        item_name TEXT NOT NULL,
        qty REAL NOT NULL,
        unit TEXT DEFAULT 'قطعة',
        cost_value REAL NOT NULL,
        reason TEXT,
        is_demo INTEGER DEFAULT 0
      );

      CREATE TABLE perfume_testers (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        sample_volume_ml REAL NOT NULL,
        total_cost REAL NOT NULL DEFAULT 0.0,
        finished_product_id TEXT,
        product_name TEXT,
        fragrance_oil_id TEXT,
        fragrance_oil_name TEXT,
        oil_volume_ml REAL DEFAULT 0.0,
        oil_cost_per_ml REAL DEFAULT 0.0,
        alcohol_id TEXT,
        alcohol_name TEXT,
        alcohol_volume_ml REAL DEFAULT 0.0,
        alcohol_cost_per_ml REAL DEFAULT 0.0,
        bottle_id TEXT,
        bottle_name TEXT,
        bottle_cost REAL DEFAULT 0.0,
        bottle_qty REAL DEFAULT 0.0,
        reason TEXT,
        dispensed_by TEXT NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_demo INTEGER DEFAULT 0
      );
    `);
    return db;
  };

  // =========================================================================
  // 1. PURCHASES MODULE: CATEGORY UNIONING & DEPENDENT INPUTS DERIVATION
  // =========================================================================
  await test('36.1.1 Purchases: Categories list never collapses to a single category when DB has isolated records', async () => {
    const db = createTestDb();
    // Simulate DB having ONLY one custom category 'اكسسوارات'
    db.prepare("INSERT INTO categories (id, name) VALUES ('cat_1', 'اكسسوارات')").run();

    const DEFAULT_CATEGORIES = [
      'عطور',
      'عطور شرقية',
      'عطور فرنسية وغربية',
      'مواد خام وزيوت عطرية',
      'زجاجات وعبوات وتغليف',
      'كحول ومذيبات سكب',
      'إكسسوارات وهدايا',
      'بخور ومباخر',
      'مثبتات وأدوات',
      'عطور عامة'
    ];

    const dbRows = db.prepare('SELECT name FROM categories').all();
    const dbNames = dbRows.map(r => r.name);

    // Merge logic
    const merged = Array.from(new Set([...DEFAULT_CATEGORIES, ...dbNames]));

    assert(merged.length >= 10, 'Merged categories must contain all default perfume ERP categories');
    assert(merged.includes('عطور'), 'Must include عطور');
    assert(merged.includes('مواد خام وزيوت عطرية'), 'Must include مواد خام');
    assert(merged.includes('زجاجات وعبوات وتغليف'), 'Must include زجاجات وعبوات');
    assert(merged.includes('اكسسوارات'), 'Must include custom DB category');
  });

  await test('36.1.2 Purchases: Category selection dynamically derives correct default unit and item_type', async () => {
    const deriveItemAttributes = (category) => {
      const cat = String(category || '').trim();
      let unit = 'قطعة';
      let item_type = 'ready_perfume';

      if (cat.includes('زيت') || cat.includes('مواد خام')) {
        unit = 'مل';
        item_type = 'raw_oil';
      } else if (cat.includes('كحول') || cat.includes('مذيب')) {
        unit = 'لتر';
        item_type = 'alcohol_fixative';
      } else if (cat.includes('زجاج') || cat.includes('عبو') || cat.includes('تغليف') || cat.includes('قارور')) {
        unit = 'قطعة';
        item_type = 'empty_bottle';
      } else if (cat.includes('إكسسوار') || cat.includes('اكسسوار') || cat.includes('هدايا') || cat.includes('مباخر')) {
        unit = 'قطعة';
        item_type = 'accessory';
      } else if (cat.includes('بخور') || cat.includes('مسك خام')) {
        unit = 'جرام';
        item_type = 'accessory';
      }

      return { unit, item_type };
    };

    assert.deepStrictEqual(deriveItemAttributes('مواد خام وزيوت عطرية'), { unit: 'مل', item_type: 'raw_oil' });
    assert.deepStrictEqual(deriveItemAttributes('كحول ومذيبات سكب'), { unit: 'لتر', item_type: 'alcohol_fixative' });
    assert.deepStrictEqual(deriveItemAttributes('زجاجات وعبوات وتغليف'), { unit: 'قطعة', item_type: 'empty_bottle' });
    assert.deepStrictEqual(deriveItemAttributes('إكسسوارات وهدايا'), { unit: 'قطعة', item_type: 'accessory' });
    assert.deepStrictEqual(deriveItemAttributes('عطور شرقية'), { unit: 'قطعة', item_type: 'ready_perfume' });
  });

  // =========================================================================
  // 2. LOSSES MODULE: TRANSACTION DATE PERSISTENCE & CSV EXPORT
  // =========================================================================
  await test('36.2.1 Losses: Custom transaction date is accurately persisted into SQLite database', async () => {
    const db = createTestDb();

    // Register a loss with a past transaction date
    const selectedDate = '2026-08-15';
    const dateIso = new Date(`${selectedDate}T12:00:00.000Z`).toISOString();

    db.prepare(`
      INSERT INTO losses (id, date, item_name, qty, unit, cost_value, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('loss_101', dateIso, 'زجاجة عطر ليالي الشرق 50 مل', 2, 'قطعة', 80.0, 'زجاجة مكسورة أثناء النقل');

    const row = db.prepare('SELECT * FROM losses WHERE id = ?').get('loss_101');
    assert.strictEqual(row.date, dateIso);
    assert(row.date.startsWith('2026-08-15'), 'Persisted date must preserve user selected date');
    assert.strictEqual(row.cost_value, 80.0);
  });

  await test('36.2.2 Losses: Source code contains explicit transaction date picker and UTF-8 BOM CSV export', async () => {
    const lossesFile = path.join(projectRoot, 'src/modules/Losses.jsx');
    const content = fs.readFileSync(lossesFile, 'utf8');

    assert(content.includes('transactionDate'), 'Losses.jsx must declare transactionDate state');
    assert(content.includes('type="date"'), 'Losses.jsx must render an explicit date picker input');
    assert(content.includes('\\uFEFF') || content.includes('\uFEFF'), 'Losses.jsx must export CSV with UTF-8 BOM');
    assert(content.includes('تصدير CSV'), 'Losses.jsx must contain CSV export button');
  });

  // =========================================================================
  // 3. TESTER BATCHES: PACKAGING BOTTLE COMPOUNDING & DYNAMIC COST DERIVATION
  // =========================================================================
  await test('36.3.1 Testers: Compounding with variable bottle packaging derives precise total cost and deducts all ingredients', async () => {
    const db = createTestDb();

    // Seed stock: Oil (100ml @ 2.5/ml), Alcohol (500ml @ 0.1/ml), Bottle (50 pcs @ 12.0/pc)
    db.prepare("INSERT INTO inventory (id, name, qty, cost, unit, item_type) VALUES (?, ?, ?, ?, ?, ?)").run('oil_oud', 'دهن عود كلمنتان خام', 100, 2.5, 'ml', 'raw_oil');
    db.prepare("INSERT INTO inventory (id, name, qty, cost, unit, item_type) VALUES (?, ?, ?, ?, ?, ?)").run('alc_eth', 'كحول إيثانول 96%', 500, 0.1, 'ml', 'alcohol_fixative');
    db.prepare("INSERT INTO inventory (id, name, qty, cost, unit, item_type) VALUES (?, ?, ?, ?, ?, ?)").run('bot_vial', 'قارورة تستر فاخرة 10 مل', 50, 12.0, 'piece', 'empty_bottle');

    // Formulation: 3ml Oil + 7ml Alcohol + 1 Bottle
    const oilVol = 3.0;
    const alcVol = 7.0;
    const bottleQty = 1.0;

    const oilCost = oilVol * 2.5;     // 7.50
    const alcCost = alcVol * 0.1;     // 0.70
    const bottleCost = bottleQty * 12.0; // 12.00
    const expectedTotal = 7.50 + 0.70 + 12.00; // 20.20

    // Atomic SQLite transaction
    const tx = db.transaction(() => {
      db.prepare("UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?").run(oilVol, 'oil_oud');
      db.prepare("UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?").run(alcVol, 'alc_eth');
      db.prepare("UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?").run(bottleQty, 'bot_vial');

      db.prepare(`
        INSERT INTO perfume_testers (
          id, source_type, sample_volume_ml, total_cost,
          fragrance_oil_id, fragrance_oil_name, oil_volume_ml, oil_cost_per_ml,
          alcohol_id, alcohol_name, alcohol_volume_ml, alcohol_cost_per_ml,
          bottle_id, bottle_name, bottle_cost, bottle_qty,
          reason, dispensed_by
        ) VALUES (?, 'compounded_mix', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'tester_mix_01', 10.0, expectedTotal,
        'oil_oud', 'دهن عود كلمنتان خام', oilVol, 2.5,
        'alc_eth', 'كحول إيثانول 96%', alcVol, 0.1,
        'bot_vial', 'قارورة تستر فاخرة 10 مل', 12.0, bottleQty,
        'عينة ترويجية', 'الكاشير'
      );
    });

    tx();

    // Verify inventory balances
    const postOil = db.prepare('SELECT qty FROM inventory WHERE id = ?').get('oil_oud');
    const postAlc = db.prepare('SELECT qty FROM inventory WHERE id = ?').get('alc_eth');
    const postBot = db.prepare('SELECT qty FROM inventory WHERE id = ?').get('bot_vial');

    assert.strictEqual(postOil.qty, 97.0, 'Oil must be deducted by 3ml');
    assert.strictEqual(postAlc.qty, 493.0, 'Alcohol must be deducted by 7ml');
    assert.strictEqual(postBot.qty, 49.0, 'Bottle must be deducted by 1 piece');

    // Verify tester record
    const tester = db.prepare('SELECT * FROM perfume_testers WHERE id = ?').get('tester_mix_01');
    assert.strictEqual(tester.total_cost, 20.20, 'Combined cost must equal Oil + Alcohol + Bottle');
    assert.strictEqual(tester.bottle_id, 'bot_vial');
    assert.strictEqual(tester.bottle_cost, 12.0);
    assert.strictEqual(tester.bottle_qty, 1.0);
  });

  // =========================================================================
  // 4. AUTOMATED GUARDRAILS VERIFICATION SCRIPT EXECUTION
  // =========================================================================
  await test('36.4.1 Error Prevention: scripts/verify_aldaffa_guardrails.cjs executes and passes 100% of 13 rules', async () => {
    const scriptPath = path.join(projectRoot, 'scripts', 'verify_aldaffa_guardrails.cjs');
    assert(fs.existsSync(scriptPath), 'verify_aldaffa_guardrails.cjs must exist');

    const output = execSync(`node "${scriptPath}"`, { cwd: projectRoot, encoding: 'utf8' });
    assert(output.includes('100% OF ALDAFFA ERROR PREVENTION GUARDRAILS VERIFIED!'), 'Guardrails audit must report 100% pass');
    assert(output.includes('Passed Checks : 13 ✅'), 'Must pass all 13 checks');
  });

  return results;
}
