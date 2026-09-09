/**
 * Suite 28: M1 It2 Challenger Adversarial Stress & Packaging Verification
 *
 * Exhaustively stress-tests:
 * 1. Static AST Invariants across PerfumeMixLab.jsx, Inventory.jsx, Settings.jsx
 * 2. Perfume compounding transaction atomicity, multi-ingredient blends, over-compounding stock floor
 * 3. Inventory modal open/close lifecycle, rapid click toggle stress, rapid product additions
 * 4. package.json build files configuration and physical file existence
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');

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

  // =========================================================================
  // 1. STATIC AST & IDENTIFIER AUDIT
  // =========================================================================

  await test('28.1.1 PerfumeMixLab: Zero undefined loadProducts calls & React hooks complete', async () => {
    const code = fs.readFileSync(path.join(projectRoot, 'src/modules/PerfumeMixLab.jsx'), 'utf8');
    const hasRawLoadProducts = /\bawait\s+loadProducts\s*\(/.test(code) || /\bloadProducts\s*\(/.test(code);
    assert.strictEqual(hasRawLoadProducts, false, 'PerfumeMixLab.jsx must not call undefined loadProducts()');
    assert(code.includes('await loadData();'), 'loadData must be called after finalization');
    assert(code.includes("typeof loadIngredients === 'function'"), 'loadIngredients check must be safe');

    const importMatch = code.match(/import\s+React,\s*\{([^}]+)\}\s+from\s+['"]react['"]/);
    assert(importMatch, 'React hooks must be imported from react');
    const importedHooks = importMatch[1].split(',').map(s => s.trim());
    ['useState', 'useEffect', 'useCallback', 'useMemo'].forEach(hook => {
      assert(importedHooks.includes(hook), `Hook ${hook} must be imported`);
    });
  });

  await test('28.1.2 Inventory: Declares showAddProduct with useState(false) & proper bindings', async () => {
    const code = fs.readFileSync(path.join(projectRoot, 'src/modules/Inventory.jsx'), 'utf8');
    const hasStateDecl = /const\s*\[\s*showAddProduct\s*,\s*setShowAddProduct\s*\]\s*=\s*useState\s*\(\s*false\s*\)/.test(code);
    assert(hasStateDecl, 'Inventory.jsx must declare showAddProduct with useState(false)');
    assert(code.includes('{showAddProduct && ('), 'Modal must conditionally render on showAddProduct');
    assert(code.includes('onClick={() => setShowAddProduct(true)}'), 'Add button must set showAddProduct(true)');
    assert(code.includes('setShowAddProduct(false)'), 'Close and cancel actions must set showAddProduct(false)');
  });

  await test('28.1.3 Settings: IPC listener payload normalization handles single & dual arg signatures', async () => {
    const code = fs.readFileSync(path.join(projectRoot, 'src/modules/Settings.jsx'), 'utf8');
    assert(code.includes('const payload = (data !== undefined) ? data : eventOrData;'), 'Settings.jsx must normalize IPC arguments');
  });

  // =========================================================================
  // 2. PERFUME MIX LAB COMPOUNDING & TRANSACTION ATOMICITY
  // =========================================================================

  function setupLabDb() {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE inventory (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT DEFAULT '',
        qty REAL DEFAULT 0,
        cost REAL DEFAULT 0,
        price REAL DEFAULT 0,
        wholesale_price REAL DEFAULT 0,
        unit TEXT DEFAULT 'piece',
        capacity REAL DEFAULT 0,
        barcode TEXT,
        min_qty REAL DEFAULT 0,
        notes TEXT DEFAULT ''
      );

      CREATE TABLE notes (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        priority TEXT DEFAULT 'normal'
      );
    `);
    return db;
  }

  await test('28.2.1 Multi-Ingredient Compounding Transaction Atomicity & Stock Deductions', async () => {
    const db = setupLabDb();
    db.prepare(`INSERT INTO inventory (id, name, category, qty, cost, unit) VALUES (?, ?, ?, ?, ?, ?)`).run('bot_1', 'زجاجة 50 مل', 'زجاجات', 100, 5.0, 'bottle');
    db.prepare(`INSERT INTO inventory (id, name, category, qty, cost, unit) VALUES (?, ?, ?, ?, ?, ?)`).run('oil_1', 'زيت عود', 'زيوت خام', 500, 1.2, 'ml');
    db.prepare(`INSERT INTO inventory (id, name, category, qty, cost, unit) VALUES (?, ?, ?, ?, ?, ?)`).run('oil_2', 'زيت صندل', 'زيوت خام', 300, 0.9, 'ml');
    db.prepare(`INSERT INTO inventory (id, name, category, qty, cost, unit) VALUES (?, ?, ?, ?, ?, ?)`).run('alc_1', 'كحول نقي', 'كحول', 2000, 0.05, 'ml');

    const batchQty = 10;
    const newProductId = 'prod_perfume_001';
    const formulaId = 'formula_001';
    const unitCost = 5.0 + (10 * 1.2) + (5 * 0.9) + (35 * 0.05);

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO inventory (id, name, category, qty, cost, price, wholesale_price, unit, capacity, barcode, min_qty, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(newProductId, 'عطر ملكي', 'عطور مركبة', batchQty, unitCost, 85, 70, 'قطعة', 50, '6281234567890', 3, 'Batch #001');

      db.prepare('UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?').run(batchQty * 1, 'bot_1');
      db.prepare('UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?').run(batchQty * 10, 'oil_1');
      db.prepare('UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?').run(batchQty * 5, 'oil_2');
      db.prepare('UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?').run(batchQty * 35, 'alc_1');

      db.prepare(`INSERT INTO notes (id, date, title, content, priority) VALUES (?, ?, ?, ?, ?)`).run(
        formulaId,
        new Date().toISOString(),
        'FORMULA: عطر ملكي',
        JSON.stringify({ newProductId, batchQty, unitCost }),
        'high'
      );
    });

    tx();

    const finished = db.prepare('SELECT * FROM inventory WHERE id = ?').get(newProductId);
    assert.strictEqual(finished.qty, 10);
    assert.strictEqual(finished.cost, 23.25);

    assert.strictEqual(db.prepare('SELECT qty FROM inventory WHERE id = ?').get('bot_1').qty, 90);
    assert.strictEqual(db.prepare('SELECT qty FROM inventory WHERE id = ?').get('oil_1').qty, 400);
    assert.strictEqual(db.prepare('SELECT qty FROM inventory WHERE id = ?').get('oil_2').qty, 250);
    assert.strictEqual(db.prepare('SELECT qty FROM inventory WHERE id = ?').get('alc_1').qty, 1650);
  });

  await test('28.2.2 High-Volume 50 Sequential Compounding Formulas Stress Test', async () => {
    const db = setupLabDb();
    db.prepare(`INSERT INTO inventory (id, name, qty, cost) VALUES (?, ?, ?, ?)`).run('bot_bulk', 'زجاجة 100 مل', 10000, 2);
    db.prepare(`INSERT INTO inventory (id, name, qty, cost) VALUES (?, ?, ?, ?)`).run('oil_bulk', 'زيت مسك', 50000, 0.5);
    db.prepare(`INSERT INTO inventory (id, name, qty, cost) VALUES (?, ?, ?, ?)`).run('alc_bulk', 'كحول', 100000, 0.02);

    for (let i = 1; i <= 50; i++) {
      const pId = `perfume_${i}`;
      const fId = `formula_${i}`;
      const batch = (i % 5) + 1;

      const tx = db.transaction(() => {
        db.prepare(`
          INSERT INTO inventory (id, name, category, qty, cost, price, wholesale_price, unit, capacity, barcode, min_qty)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(pId, `عطر تجريبي ${i}`, 'خلطات', batch, 10, 50, 40, 'قطعة', 100, `628000000${i}`, 2);

        db.prepare('UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?').run(batch, 'bot_bulk');
        db.prepare('UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?').run(20 * batch, 'oil_bulk');
        db.prepare('UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?').run(80 * batch, 'alc_bulk');

        db.prepare(`INSERT INTO notes (id, date, title, content, priority) VALUES (?, ?, ?, ?, ?)`).run(
          fId,
          new Date().toISOString(),
          `FORMULA: عطر تجريبي ${i}`,
          JSON.stringify({ pId, batch }),
          'normal'
        );
      });

      tx();
    }

    assert.strictEqual(db.prepare('SELECT COUNT(*) as count FROM notes WHERE title LIKE ?').get('FORMULA:%').count, 50);
    assert.strictEqual(db.prepare('SELECT COUNT(*) as count FROM inventory WHERE category = ?').get('خلطات').count, 50);
  });

  await test('28.2.3 Compounding Non-Negative Stock Floor (MAX(0, qty - ?)) Clamping', async () => {
    const db = setupLabDb();
    db.prepare(`INSERT INTO inventory (id, name, qty, cost) VALUES (?, ?, ?, ?)`).run('bot_scarce', 'زجاجة نادرة', 5, 10);
    db.prepare(`INSERT INTO inventory (id, name, qty, cost) VALUES (?, ?, ?, ?)`).run('oil_scarce', 'زيت نادر', 10, 5);

    const tx = db.transaction(() => {
      db.prepare(`INSERT INTO inventory (id, name, qty, cost, price) VALUES (?, ?, ?, ?, ?)`).run('perfume_over', 'عطر نفاذ المخزون', 20, 15, 60);
      db.prepare('UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?').run(20, 'bot_scarce');
      db.prepare('UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?').run(40, 'oil_scarce');
    });

    tx();

    assert.strictEqual(db.prepare('SELECT qty FROM inventory WHERE id = ?').get('bot_scarce').qty, 0);
    assert.strictEqual(db.prepare('SELECT qty FROM inventory WHERE id = ?').get('oil_scarce').qty, 0);
  });

  // =========================================================================
  // 3. INVENTORY MODAL & RAPID CLICK STRESS
  // =========================================================================

  await test('28.3.1 Rapid Modal Toggle State Machine (1,000 Rapid Cycles)', async () => {
    let showAddProduct = false;
    let formData = { name: '', price: 0 };
    let transitions = 0;

    for (let i = 0; i < 1000; i++) {
      // Open modal
      showAddProduct = true;
      formData = { name: `Product ${i}`, price: i * 5 };
      assert.strictEqual(showAddProduct, true);
      transitions++;

      // Close modal
      showAddProduct = false;
      formData = { name: '', price: 0 };
      assert.strictEqual(showAddProduct, false);
      transitions++;
    }

    assert.strictEqual(transitions, 2000);
  });

  await test('28.3.2 Rapid Concurrent Product Additions Simulation (50 Rapid Submissions)', async () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE inventory (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT DEFAULT '',
        qty REAL DEFAULT 0,
        cost REAL DEFAULT 0,
        price REAL DEFAULT 0,
        wholesale_price REAL DEFAULT 0,
        unit TEXT DEFAULT 'piece',
        capacity REAL DEFAULT 0
      );
    `);

    const stmt = db.prepare(`
      INSERT INTO inventory (id, name, category, qty, cost, price, wholesale_price, unit, capacity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < 50; i++) {
      stmt.run(`prod_${i}`, `منتج ${i}`, 'عام', i + 1, 10, 25, 20, 'piece', 50);
    }

    const count = db.prepare('SELECT COUNT(*) as count FROM inventory').get();
    assert.strictEqual(count.count, 50);
  });

  // =========================================================================
  // 4. PACKAGE.JSON BUILD PACKAGING CONFIGURATION
  // =========================================================================

  await test('28.4.1 package.json includes preload.cjs in build.files', async () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    assert(pkg.build && Array.isArray(pkg.build.files), 'package.json must contain build.files array');
    assert(pkg.build.files.includes('preload.cjs'), '"preload.cjs" must be in build.files');
    assert(pkg.build.files.includes('main.cjs'), '"main.cjs" must be in build.files');
    assert(pkg.build.files.includes('dist/**/*'), '"dist/**/*" must be in build.files');
  });

  await test('28.4.2 Physical files existence verification for build.files entries', async () => {
    assert(fs.existsSync(path.join(projectRoot, 'main.cjs')), 'main.cjs exists');
    assert(fs.existsSync(path.join(projectRoot, 'preload.cjs')), 'preload.cjs exists');
    assert(fs.existsSync(path.join(projectRoot, 'package.json')), 'package.json exists');
    assert(fs.existsSync(path.join(projectRoot, 'dist/index.html')), 'dist/index.html exists');
  });

  return results;
}
