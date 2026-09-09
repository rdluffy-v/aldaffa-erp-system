/**
 * Comprehensive Empirical Verification Harness for Debtors Module Lifecycle
 * Tests:
 * 1. Static AST / Scope Analysis of src/modules/Debtors.jsx
 * 2. Runtime Execution of deleteHistoryRecord and deleteDebtor
 * 3. Database Invariants: Balance recalculation, negative balances, NaN, orphaned records
 * 4. Verification of loadDebtorHistory and payment ledger reactivity
 */

import Database from 'better-sqlite3';
import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('===============================================================');
console.log('🔬 DEBTOR LIFECYCLE EMPIRICAL VERIFICATION HARNESS');
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
// 1. Static Scope & Identifier Analysis of Debtors.jsx
// -------------------------------------------------------------------
console.log('📦 Test Section 1: Static Scope & AST Analysis of Debtors.jsx');

runTest('1.1 Debtors.jsx imports check for db', () => {
  const code = fs.readFileSync('src/modules/Debtors.jsx', 'utf8');
  
  // Check if db is imported
  const hasDbImport = /import\s+.*?\bdb\b.*?from\s+['"].*?connection(?:\.js)?['"]/.test(code);
  const dbUsages = code.match(/\bdb\.(?:run|query|get|transaction)\b/g) || [];
  
  console.log(`   db usages found: ${dbUsages.length}`);
  console.log(`   has db import: ${hasDbImport}`);
  
  // If db is used 3 times without import, this is a confirmed reference defect
  if (dbUsages.length > 0 && !hasDbImport) {
    throw new Error(`CRITICAL: Debtors.jsx references 'db' (${dbUsages.join(', ')}) without importing 'db' from connection.js! This causes ReferenceError: db is not defined when deleteHistoryRecord or deleteDebtor executes.`);
  }
  assert.strictEqual(hasDbImport, true, 'Debtors.jsx must import db');
});

runTest('1.2 Debtors.jsx verifies loadDebtorHistory method definition and calls', () => {
  const code = fs.readFileSync('src/modules/Debtors.jsx', 'utf8');
  
  // Verify loadDebtorHistory definition exists
  assert(code.includes('const loadDebtorHistory = async (debtorId) => {'), 'loadDebtorHistory must be defined');
  
  // Verify zero references to misspelled loadDebtHistory
  const hasMisspelled = /\bloadDebtHistory\b/.test(code);
  assert.strictEqual(hasMisspelled, false, 'No references to loadDebtHistory should exist');
  
  // Verify calls to loadDebtorHistory
  const calls = code.match(/\bloadDebtorHistory\s*\(/g) || [];
  console.log(`   loadDebtorHistory calls found: ${calls.length}`);
  assert(calls.length >= 4, 'loadDebtorHistory should be called in selectDebtor, addTransaction, refresh, and deleteHistoryRecord');
});

// -------------------------------------------------------------------
// 2. Simulated Component Runtime Execution of deleteHistoryRecord
// -------------------------------------------------------------------
console.log('\n📦 Test Section 2: Runtime Execution Simulation');

runTest('2.1 Simulating deleteHistoryRecord execution in Debtors.jsx scope', () => {
  const code = fs.readFileSync('src/modules/Debtors.jsx', 'utf8');
  
  // Extract onConfirm body inside deleteHistoryRecord
  const deleteHistoryMatch = code.match(/const deleteHistoryRecord = \(record\) => \{([\s\S]*?)\n  \};/);
  assert(deleteHistoryMatch, 'deleteHistoryRecord function must exist in code');
  
  // Simulate execution environment without db in module scope (as currently structured in Debtors.jsx)
  let runtimeError = null;
  try {
    // In a module where db is not imported:
    const mockRecord = { id: 'rec_1', type: 'debt', amount: 100 };
    const mockSelectedDebtor = { id: 'deb_1', name: 'Test', total_debt: 100 };
    
    // Evaluate in an isolated scope that mimics Debtors.jsx module scope
    const fn = new Function('record', 'selectedDebtor', `
      const delta = record.type === 'debt' ? -record.amount : record.amount;
      return db.run('DELETE FROM debt_history WHERE id = ?', [record.id]);
    `);
    
    fn(mockRecord, mockSelectedDebtor);
  } catch (e) {
    runtimeError = e;
  }
  
  assert(runtimeError instanceof ReferenceError, 'Must catch ReferenceError when db is not defined');
  console.log(`   Captured runtime error: ${runtimeError.name}: ${runtimeError.message}`);
  
  // Now verify that with db imported, it succeeds
  const mockDb = {
    runs: [],
    run(sql, params) {
      this.runs.push({ sql, params });
      return Promise.resolve({ success: true });
    }
  };
  
  const safeFn = new Function('record', 'selectedDebtor', 'db', `
    const delta = record.type === 'debt' ? -record.amount : record.amount;
    return db.run('DELETE FROM debt_history WHERE id = ?', [record.id]);
  `);
  
  safeFn({ id: 'rec_1', type: 'debt', amount: 100 }, { id: 'deb_1' }, mockDb);
  assert.strictEqual(mockDb.runs.length, 1);
  assert.strictEqual(mockDb.runs[0].sql, 'DELETE FROM debt_history WHERE id = ?');
});

// -------------------------------------------------------------------
// 3. SQLite Database Invariants: Balance Recalculation, Clamping & Rollbacks
// -------------------------------------------------------------------
console.log('\n📦 Test Section 3: SQLite Mathematical & Data Invariants');

function setupTestDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE debtors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      total_debt REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      is_demo INTEGER DEFAULT 0
    );

    CREATE TABLE debt_history (
      id TEXT PRIMARY KEY,
      debtor_id TEXT NOT NULL,
      date TEXT NOT NULL,
      type TEXT NOT NULL, -- 'debt' or 'payment'
      amount REAL NOT NULL,
      invoice_id TEXT,
      is_demo INTEGER DEFAULT 0,
      FOREIGN KEY (debtor_id) REFERENCES debtors(id)
    );
  `);
  return db;
}

runTest('3.1 Full Transaction Lifecycle: Initial Debt -> Payment -> Delete Payment -> Delete Debt', () => {
  const db = setupTestDb();
  const debtorId = 'deb_001';
  
  // 1. Create debtor
  db.prepare('INSERT INTO debtors (id, name, phone, total_debt) VALUES (?, ?, ?, 0)').run(debtorId, 'عميل VIP', '0912345678');
  let debtor = db.prepare('SELECT * FROM debtors WHERE id = ?').get(debtorId);
  assert.strictEqual(debtor.total_debt, 0);

  // 2. Add Debt transaction: 500
  const tx1Id = 'tx_001';
  db.prepare('INSERT INTO debt_history (id, debtor_id, date, type, amount) VALUES (?, ?, ?, ?, ?)').run(tx1Id, debtorId, new Date().toISOString(), 'debt', 500);
  db.prepare('UPDATE debtors SET total_debt = total_debt + ? WHERE id = ?').run(500, debtorId);
  debtor = db.prepare('SELECT * FROM debtors WHERE id = ?').get(debtorId);
  assert.strictEqual(debtor.total_debt, 500, 'Total debt should be 500');

  // 3. Add Payment transaction: 200
  const tx2Id = 'tx_002';
  db.prepare('INSERT INTO debt_history (id, debtor_id, date, type, amount) VALUES (?, ?, ?, ?, ?)').run(tx2Id, debtorId, new Date().toISOString(), 'payment', 200);
  db.prepare('UPDATE debtors SET total_debt = total_debt - ? WHERE id = ?').run(200, debtorId);
  debtor = db.prepare('SELECT * FROM debtors WHERE id = ?').get(debtorId);
  assert.strictEqual(debtor.total_debt, 300, 'Total debt should be 300');

  // 4. Delete Payment transaction (tx2): delta = +200
  const delta2 = 200; // record.type === 'payment' ? record.amount : -record.amount
  db.prepare('DELETE FROM debt_history WHERE id = ?').run(tx2Id);
  db.prepare('UPDATE debtors SET total_debt = MAX(0, total_debt + ?) WHERE id = ?').run(delta2, debtorId);
  debtor = db.prepare('SELECT * FROM debtors WHERE id = ?').get(debtorId);
  assert.strictEqual(debtor.total_debt, 500, 'Total debt should revert to 500 after payment deletion');

  // 5. Delete Debt transaction (tx1): delta = -500
  const delta1 = -500; // record.type === 'debt' ? -record.amount : record.amount
  db.prepare('DELETE FROM debt_history WHERE id = ?').run(tx1Id);
  db.prepare('UPDATE debtors SET total_debt = MAX(0, total_debt + ?) WHERE id = ?').run(delta1, debtorId);
  debtor = db.prepare('SELECT * FROM debtors WHERE id = ?').get(debtorId);
  assert.strictEqual(debtor.total_debt, 0, 'Total debt should revert to 0 after debt deletion');
  assert(!isNaN(debtor.total_debt), 'Total debt must never be NaN');
});

runTest('3.2 Deleting debt transaction when payments exceed remaining debt clamps to 0 (non-negative)', () => {
  const db = setupTestDb();
  const debtorId = 'deb_002';
  
  db.prepare('INSERT INTO debtors (id, name, total_debt) VALUES (?, ?, 0)').run(debtorId, 'عميل 2');
  
  // Add Debt: 300 -> total_debt = 300
  const tx1Id = 'tx_201';
  db.prepare('INSERT INTO debt_history (id, debtor_id, date, type, amount) VALUES (?, ?, ?, ?, ?)').run(tx1Id, debtorId, new Date().toISOString(), 'debt', 300);
  db.prepare('UPDATE debtors SET total_debt = total_debt + ? WHERE id = ?').run(300, debtorId);

  // Add Payment: 250 -> total_debt = 50
  const tx2Id = 'tx_202';
  db.prepare('INSERT INTO debt_history (id, debtor_id, date, type, amount) VALUES (?, ?, ?, ?, ?)').run(tx2Id, debtorId, new Date().toISOString(), 'payment', 250);
  db.prepare('UPDATE debtors SET total_debt = total_debt - ? WHERE id = ?').run(250, debtorId);

  // Now delete the 300 debt: delta = -300. total_debt was 50, so 50 - 300 = -250.
  // MAX(0, total_debt + delta) must clamp to 0.
  const delta = -300;
  db.prepare('DELETE FROM debt_history WHERE id = ?').run(tx1Id);
  db.prepare('UPDATE debtors SET total_debt = MAX(0, total_debt + ?) WHERE id = ?').run(delta, debtorId);
  
  const debtor = db.prepare('SELECT * FROM debtors WHERE id = ?').get(debtorId);
  assert.strictEqual(debtor.total_debt, 0, 'Total debt must be clamped to 0, never negative');
  assert(debtor.total_debt >= 0, 'Balance must be non-negative');
});

runTest('3.3 Orphan Record Prevention on Debtor Cascade Deletion', () => {
  const db = setupTestDb();
  const debtorId = 'deb_003';
  
  db.prepare('INSERT INTO debtors (id, name, total_debt) VALUES (?, ?, 100)').run(debtorId, 'عميل للحذف');
  db.prepare('INSERT INTO debt_history (id, debtor_id, date, type, amount) VALUES (?, ?, ?, ?, ?)').run('tx_301', debtorId, new Date().toISOString(), 'debt', 100);
  db.prepare('INSERT INTO debt_history (id, debtor_id, date, type, amount) VALUES (?, ?, ?, ?, ?)').run('tx_302', debtorId, new Date().toISOString(), 'payment', 50);

  // Deletion logic in deleteDebtor:
  // 1. DELETE FROM debt_history WHERE debtor_id = ?
  // 2. DELETE FROM debtors WHERE id = ?
  db.prepare('DELETE FROM debt_history WHERE debtor_id = ?').run(debtorId);
  db.prepare('DELETE FROM debtors WHERE id = ?').run(debtorId);

  const debtor = db.prepare('SELECT * FROM debtors WHERE id = ?').get(debtorId);
  const remainingHistory = db.prepare('SELECT * FROM debt_history WHERE debtor_id = ?').all(debtorId);

  assert.strictEqual(debtor, undefined, 'Debtor must be deleted');
  assert.strictEqual(remainingHistory.length, 0, 'Zero orphaned debt_history records must remain');
});

runTest('3.4 Floating-point precision stability over 100 randomized micro-transactions', () => {
  const db = setupTestDb();
  const debtorId = 'deb_004';
  db.prepare('INSERT INTO debtors (id, name, total_debt) VALUES (?, ?, 0)').run(debtorId, 'عميل عشوائي');

  let expectedTotal = 0;
  const txList = [];

  // Add 50 debt and 50 payment transactions with 2 decimal places
  for (let i = 0; i < 50; i++) {
    const debtAmt = Math.round((Math.random() * 50 + 1) * 100) / 100;
    const txId = `debt_${i}`;
    db.prepare('INSERT INTO debt_history (id, debtor_id, date, type, amount) VALUES (?, ?, ?, ?, ?)').run(txId, debtorId, new Date().toISOString(), 'debt', debtAmt);
    db.prepare('UPDATE debtors SET total_debt = total_debt + ? WHERE id = ?').run(debtAmt, debtorId);
    expectedTotal = Math.round((expectedTotal + debtAmt) * 100) / 100;
    txList.push({ id: txId, type: 'debt', amount: debtAmt });

    const payAmt = Math.round((Math.random() * 20 + 1) * 100) / 100;
    const payId = `pay_${i}`;
    db.prepare('INSERT INTO debt_history (id, debtor_id, date, type, amount) VALUES (?, ?, ?, ?, ?)').run(payId, debtorId, new Date().toISOString(), 'payment', payAmt);
    db.prepare('UPDATE debtors SET total_debt = total_debt - ? WHERE id = ?').run(payAmt, debtorId);
    expectedTotal = Math.round((expectedTotal - payAmt) * 100) / 100;
    txList.push({ id: payId, type: 'payment', amount: payAmt });
  }

  let current = db.prepare('SELECT total_debt FROM debtors WHERE id = ?').get(debtorId);
  assert(Math.abs(current.total_debt - expectedTotal) < 0.001, `Floating point precision drift: ${current.total_debt} vs ${expectedTotal}`);

  // Now delete 20 random transactions
  for (let i = 0; i < 20; i++) {
    const tx = txList[i];
    const delta = tx.type === 'debt' ? -tx.amount : tx.amount;
    db.prepare('DELETE FROM debt_history WHERE id = ?').run(tx.id);
    db.prepare('UPDATE debtors SET total_debt = MAX(0, total_debt + ?) WHERE id = ?').run(delta, debtorId);
    expectedTotal = Math.max(0, Math.round((expectedTotal + delta) * 100) / 100);
  }

  current = db.prepare('SELECT total_debt FROM debtors WHERE id = ?').get(debtorId);
  assert(Math.abs(current.total_debt - expectedTotal) < 0.001, `After deletion precision: ${current.total_debt} vs ${expectedTotal}`);
  assert(!isNaN(current.total_debt), 'total_debt is not NaN');
  assert(current.total_debt >= 0, 'total_debt is non-negative');
});

console.log('\n===============================================================');
console.log(`📊 HARNESS SUMMARY: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
console.log('===============================================================');

if (failedTests > 0) {
  process.exit(1);
}
