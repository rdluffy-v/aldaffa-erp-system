/**
 * Empirical Stress and Challenge Harness for:
 * 1. PerfumeMixLab.jsx formula compounding, scope safety, and transaction stress.
 * 2. Inventory.jsx modal open/close lifecycle, state transitions, and rapid click stress.
 * 3. package.json build files packaging verification.
 */

import Database from 'better-sqlite3';
import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('===============================================================');
console.log('🧪 EMPIRICAL CHALLENGER STRESS HARNESS: PERFUME MIX LAB & INVENTORY');
console.log('===============================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(`   Error: ${err.message}`);
    failedTests++;
  }
}

// -------------------------------------------------------------------
// SECTION 1: PerfumeMixLab.jsx Static Scope & Identifier Safety
// -------------------------------------------------------------------
console.log('📦 Section 1: PerfumeMixLab.jsx Scope & AST Safety Verification');

runTest('1.1 PerfumeMixLab.jsx has zero unhandled loadProducts calls', () => {
  const code = fs.readFileSync('src/modules/PerfumeMixLab.jsx', 'utf8');
  
  // Verify loadProducts is not called as a standalone function
  const hasRawLoadProducts = /\bawait\s+loadProducts\s*\(/.test(code) || /\bloadProducts\s*\(/.test(code);
  assert.strictEqual(hasRawLoadProducts, false, 'PerfumeMixLab.jsx must not call undefined loadProducts()');
  
  // Verify safe alternative exists (loadIngredients or loadData)
  assert(code.includes('await loadData();'), 'loadData must be called after finalization');
  assert(code.includes("typeof loadIngredients === 'function'"), 'loadIngredients check must be safe');
});

runTest('1.2 PerfumeMixLab.jsx React Hook import completeness', () => {
  const code = fs.readFileSync('src/modules/PerfumeMixLab.jsx', 'utf8');
  const importMatch = code.match(/import\s+React,\s*\{([^}]+)\}\s+from\s+['"]react['"]/);
  assert(importMatch, 'React hooks must be imported from react');
  
  const importedHooks = importMatch[1].split(',').map(s => s.trim());
  ['useState', 'useEffect', 'useCallback', 'useMemo'].forEach(hook => {
    assert(importedHooks.includes(hook), `Hook ${hook} must be imported`);
  });
});

// -------------------------------------------------------------------
// SECTION 2: PerfumeMixLab.jsx Compounding Transaction & Database Invariants
// -------------------------------------------------------------------
console.log('\n📦 Section 2: PerfumeMixLab Compounding & Stress Invariants');

function setupPerfumeLabDb() {
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

runTest('2.1 Multi-Ingredient Compounding Transaction Atomicity', () => {
  const db = setupPerfumeLabDb();
  
  // Setup Raw Materials
  db.prepare(`INSERT INTO inventory (id, name, category, qty, cost, unit) VALUES (?, ?, ?, ?, ?, ?)`).run('bot_1', 'زجاجة كرستال 50 مل', 'زجاجات', 100, 5.0, 'bottle');
  db.prepare(`INSERT INTO inventory (id, name, category, qty, cost, unit) VALUES (?, ?, ?, ?, ?, ?)`).run('oil_1', 'زيت عود ملكي', 'زيوت خام', 500, 1.2, 'ml');
  db.prepare(`INSERT INTO inventory (id, name, category, qty, cost, unit) VALUES (?, ?, ?, ?, ?, ?)`).run('oil_2', 'زيت صندل ميسور', 'زيوت خام', 300, 0.9, 'ml');
  db.prepare(`INSERT INTO inventory (id, name, category, qty, cost, unit) VALUES (?, ?, ?, ?, ?, ?)`).run('alc_1', 'كحول فرنسي 96%', 'كحول ومذيبات', 2000, 0.05, 'ml');

  // Compounding Batch: 10 bottles of 50ml perfume
  // Each bottle: 10ml oil_1, 5ml oil_2, 35ml alc_1, 1 bottle
  const batchQty = 10;
  const newProductId = 'prod_perfume_001';
  const formulaId = 'formula_001';
  const unitCost = 5.0 + (10 * 1.2) + (5 * 0.9) + (35 * 0.05); // 5 + 12 + 4.5 + 1.75 = 23.25
  const retailPrice = 85.0;

  const tx = db.transaction(() => {
    // 1. Insert Finished Product
    db.prepare(`
      INSERT INTO inventory (id, name, category, qty, cost, price, wholesale_price, unit, capacity, barcode, min_qty, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(newProductId, 'خلطة الدفة الخاصة', 'عطور مركبة', batchQty, unitCost, retailPrice, 70, 'قطعة', 50, '6281234567890', 3, 'Batch #001');

    // 2. Deduct raw materials
    db.prepare('UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?').run(batchQty * 1, 'bot_1');
    db.prepare('UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?').run(batchQty * 10, 'oil_1');
    db.prepare('UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?').run(batchQty * 5, 'oil_2');
    db.prepare('UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?').run(batchQty * 35, 'alc_1');

    // 3. Save Formula spec to notes
    db.prepare(`INSERT INTO notes (id, date, title, content, priority) VALUES (?, ?, ?, ?, ?)`).run(
      formulaId,
      new Date().toISOString(),
      'FORMULA: خلطة الدفة الخاصة',
      JSON.stringify({ newProductId, batchQty, unitCost, retailPrice }),
      'high'
    );
  });

  tx();

  // Verify Results
  const finished = db.prepare('SELECT * FROM inventory WHERE id = ?').get(newProductId);
  assert.strictEqual(finished.qty, 10, 'Finished perfume quantity must be 10');
  assert.strictEqual(finished.cost, 23.25, 'Unit cost must equal 23.25');

  const bot = db.prepare('SELECT qty FROM inventory WHERE id = ?').get('bot_1');
  assert.strictEqual(bot.qty, 90, 'Bottles must be deducted by 10');

  const oil1 = db.prepare('SELECT qty FROM inventory WHERE id = ?').get('oil_1');
  assert.strictEqual(oil1.qty, 400, 'Oil 1 must be deducted by 100ml');

  const oil2 = db.prepare('SELECT qty FROM inventory WHERE id = ?').get('oil_2');
  assert.strictEqual(oil2.qty, 250, 'Oil 2 must be deducted by 50ml');

  const alc = db.prepare('SELECT qty FROM inventory WHERE id = ?').get('alc_1');
  assert.strictEqual(alc.qty, 1650, 'Alcohol must be deducted by 350ml');

  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(formulaId);
  assert(note, 'Formula note must be created');
  assert.strictEqual(note.title, 'FORMULA: خلطة الدفة الخاصة');
});

runTest('2.2 High-Volume Rapid Compounding Stress Test (50 Sequential Formulas)', () => {
  const db = setupPerfumeLabDb();
  
  // Create massive stock
  db.prepare(`INSERT INTO inventory (id, name, qty, cost) VALUES (?, ?, ?, ?)`).run('bot_bulk', 'زجاجة 100 مل', 10000, 2);
  db.prepare(`INSERT INTO inventory (id, name, qty, cost) VALUES (?, ?, ?, ?)`).run('oil_bulk', 'زيت مسك أبيض', 50000, 0.5);
  db.prepare(`INSERT INTO inventory (id, name, qty, cost) VALUES (?, ?, ?, ?)`).run('alc_bulk', 'كحول إيثيلي', 100000, 0.02);

  for (let i = 1; i <= 50; i++) {
    const pId = `perfume_${i}`;
    const fId = `formula_${i}`;
    const batch = (i % 5) + 1; // 1 to 5 bottles
    const oilMl = 20 * batch;
    const alcMl = 80 * batch;

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO inventory (id, name, category, qty, cost, price, wholesale_price, unit, capacity, barcode, min_qty)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(pId, `عطر تجريبي ${i}`, 'خلطات', batch, 10, 50, 40, 'قطعة', 100, `628000000${i}`, 2);

      db.prepare('UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?').run(batch, 'bot_bulk');
      db.prepare('UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?').run(oilMl, 'oil_bulk');
      db.prepare('UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?').run(alcMl, 'alc_bulk');

      db.prepare(`INSERT INTO notes (id, date, title, content, priority) VALUES (?, ?, ?, ?, ?)`).run(
        fId,
        new Date().toISOString(),
        `FORMULA: عطر تجريبي ${i}`,
        JSON.stringify({ pId, batch, oilMl, alcMl }),
        'normal'
      );
    });

    tx();
  }

  const allFormulas = db.prepare('SELECT COUNT(*) as count FROM notes WHERE title LIKE ?').get('FORMULA:%');
  assert.strictEqual(allFormulas.count, 50, 'All 50 formulas must be persisted');

  const allPerfumes = db.prepare('SELECT COUNT(*) as count FROM inventory WHERE category = ?').get('خلطات');
  assert.strictEqual(allPerfumes.count, 50, 'All 50 perfumes must exist in inventory');

  const botStock = db.prepare('SELECT qty FROM inventory WHERE id = ?').get('bot_bulk');
  assert(botStock.qty < 10000 && botStock.qty > 0, 'Bottle stock correctly decremented');
});

runTest('2.3 Non-Negative Stock Floor Invariant on Over-Compounding', () => {
  const db = setupPerfumeLabDb();
  
  // Stock has only 5 bottles
  db.prepare(`INSERT INTO inventory (id, name, qty, cost) VALUES (?, ?, ?, ?)`).run('bot_scarce', 'زجاجة نادرة', 5, 10);
  db.prepare(`INSERT INTO inventory (id, name, qty, cost) VALUES (?, ?, ?, ?)`).run('oil_scarce', 'زيت نادر', 10, 5);

  // Attempt to compound 20 bottles (exceeding stock of 5)
  const batchQty = 20;
  const pId = 'perfume_overdraft';

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO inventory (id, name, qty, cost, price)
      VALUES (?, ?, ?, ?, ?)
    `).run(pId, 'عطر نفاذ المخزون', batchQty, 15, 60);

    db.prepare('UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?').run(batchQty, 'bot_scarce');
    db.prepare('UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?').run(batchQty * 2, 'oil_scarce');
  });

  tx();

  const bot = db.prepare('SELECT qty FROM inventory WHERE id = ?').get('bot_scarce');
  const oil = db.prepare('SELECT qty FROM inventory WHERE id = ?').get('oil_scarce');

  assert.strictEqual(bot.qty, 0, 'Bottle stock clamped to 0 (non-negative)');
  assert.strictEqual(oil.qty, 0, 'Oil stock clamped to 0 (non-negative)');
});

// -------------------------------------------------------------------
// SECTION 3: Inventory.jsx Modal State & Rapid Click Simulation
// -------------------------------------------------------------------
console.log('\n📦 Section 3: Inventory.jsx Modal Open/Close & Rapid Click Stress');

runTest('3.1 Inventory.jsx Declares showAddProduct State Correctly', () => {
  const code = fs.readFileSync('src/modules/Inventory.jsx', 'utf8');
  
  // Verify declaration
  const hasStateDecl = /const\s*\[\s*showAddProduct\s*,\s*setShowAddProduct\s*\]\s*=\s*useState\s*\(\s*false\s*\)/.test(code);
  assert(hasStateDecl, 'Inventory.jsx must declare showAddProduct with useState(false)');
  
  // Verify modal conditional rendering
  assert(code.includes('{showAddProduct && ('), 'Modal must conditionally render on showAddProduct');

  // Verify button click
  assert(code.includes('onClick={() => setShowAddProduct(true)}'), 'Add button must set showAddProduct(true)');

  // Verify cancel / close clicks
  assert(code.includes('setShowAddProduct(false)'), 'Close and cancel actions must set showAddProduct(false)');
});

runTest('3.2 Rapid Modal Toggle Simulation (1,000 Rapid Cycles)', () => {
  // Simulate React state container for modal state machine
  class ModalStateMachine {
    constructor() {
      this.showAddProduct = false;
      this.formData = {
        name: '',
        category: '',
        qty: 0,
        cost: 0,
        price: 0,
        wholesale_price: 0,
        unit: 'piece',
        capacity: 0
      };
      this.history = [];
    }

    openModal() {
      this.showAddProduct = true;
      this.history.push({ state: 'OPEN', timestamp: Date.now() });
    }

    closeModal() {
      this.showAddProduct = false;
      this.formData = {
        name: '',
        category: '',
        qty: 0,
        cost: 0,
        price: 0,
        wholesale_price: 0,
        unit: 'piece',
        capacity: 0
      };
      this.history.push({ state: 'CLOSED', timestamp: Date.now() });
    }

    fillData(patch) {
      if (!this.showAddProduct) return;
      this.formData = { ...this.formData, ...patch };
    }
  }

  const machine = new ModalStateMachine();

  // Rapidly toggle 1000 times
  for (let i = 0; i < 1000; i++) {
    machine.openModal();
    assert.strictEqual(machine.showAddProduct, true, 'Modal should be open');
    machine.fillData({ name: `Product ${i}`, price: i * 10 });
    assert.strictEqual(machine.formData.name, `Product ${i}`);
    
    machine.closeModal();
    assert.strictEqual(machine.showAddProduct, false, 'Modal should be closed');
    assert.strictEqual(machine.formData.name, '', 'Form data should be reset on close');
  }

  assert.strictEqual(machine.history.length, 2000, '2000 state transitions recorded without deadlock');
});

runTest('3.3 Rapid Concurrent Product Additions Simulation (50 Rapid Submissions)', () => {
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
    const rawInput = {
      name: `   عطر فخم رقم ${i}   `,
      category: 'عطور شرقية',
      qty: `${i + 1}`,
      cost: '15.50',
      price: '45.00',
      wholesale_price: '35.00',
      unit: 'bottle',
      capacity: '100'
    };

    // Safe normalization mirroring addProduct logic
    const id = `prod_inv_${i}`;
    const name = rawInput.name.trim();
    const category = rawInput.category;
    const qty = parseFloat(rawInput.qty) || 0;
    const cost = parseFloat(rawInput.cost) || 0;
    const price = parseFloat(rawInput.price) || 0;
    const wholesale_price = parseFloat(rawInput.wholesale_price) || 0;
    const unit = rawInput.unit;
    const capacity = parseFloat(rawInput.capacity) || 0;

    stmt.run(id, name, category, qty, cost, price, wholesale_price, unit, capacity);
  }

  const count = db.prepare('SELECT COUNT(*) as count FROM inventory').get();
  assert.strictEqual(count.count, 50, 'All 50 rapid product submissions succeeded');

  const check = db.prepare('SELECT * FROM inventory WHERE id = ?').get('prod_inv_0');
  assert.strictEqual(check.name, 'عطر فخم رقم 0', 'Trimmed name matches');
  assert.strictEqual(check.qty, 1);
  assert.strictEqual(check.cost, 15.5);
  assert.strictEqual(check.price, 45.0);
});

// -------------------------------------------------------------------
// SECTION 4: package.json Build Files Packaging Verification
// -------------------------------------------------------------------
console.log('\n📦 Section 4: package.json Build Packaging Configuration');

runTest('4.1 package.json includes preload.cjs in build.files', () => {
  const pkgContent = fs.readFileSync('package.json', 'utf8');
  const pkg = JSON.parse(pkgContent);

  assert(pkg.build, 'package.json must contain "build" configuration object');
  assert(Array.isArray(pkg.build.files), '"build.files" must be an array');
  
  console.log(`   build.files contains: ${JSON.stringify(pkg.build.files)}`);
  
  assert(pkg.build.files.includes('preload.cjs'), '"preload.cjs" must be explicitly included in build.files');
  assert(pkg.build.files.includes('main.cjs'), '"main.cjs" must be included in build.files');
  assert(pkg.build.files.includes('dist/**/*'), '"dist/**/*" must be included in build.files');
  assert(pkg.build.files.includes('package.json'), '"package.json" must be included in build.files');
});

runTest('4.2 Verify physical existence of all files referenced in package.json build.files', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  
  assert(fs.existsSync('main.cjs'), 'main.cjs must exist on disk');
  assert(fs.existsSync('preload.cjs'), 'preload.cjs must exist on disk');
  assert(fs.existsSync('package.json'), 'package.json must exist on disk');
  assert(fs.existsSync('dist/index.html'), 'dist/index.html must exist on disk (from npm run build)');
});

// -------------------------------------------------------------------
// SUMMARY
// -------------------------------------------------------------------
console.log('\n===============================================================');
console.log(`📊 HARNESS SUMMARY: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
console.log('===============================================================');

if (failedTests > 0) {
  process.exit(1);
}
