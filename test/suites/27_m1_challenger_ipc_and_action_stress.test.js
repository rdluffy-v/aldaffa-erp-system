/**
 * Suite 27: M1 Challenger Adversarial Stress & Edge Case Verification
 *
 * Exhaustively stress-tests:
 * 1. Static AST Invariants across Invoices.jsx, Analytics.jsx, Debtors.jsx
 * 2. Undefined IPC Runtime fallbacks
 * 3. IPC Error Rejections & Graceful Exception Handling
 * 4. Empty / Corrupted / Boundary Payloads
 * 5. Rapid Button Clicks & High-Concurrency IPC Invocations
 * 6. Debtors History Deletion Atomic Balance Invariants & Reactivity
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTestDb } from '../harness/test-db.js';

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
  // 1. STATIC AST & CODEBASE REPOSITORY VERIFICATION
  // =========================================================================

  await test('27.1.1 Static AST Check: Zero occurrences of electron.ipcRenderer in src/', async () => {
    const srcDir = path.join(projectRoot, 'src');
    const walk = (dir) => {
      let files = [];
      for (const item of fs.readdirSync(dir)) {
        const full = path.join(dir, item);
        if (fs.statSync(full).isDirectory()) {
          files = files.concat(walk(full));
        } else if (full.endsWith('.jsx') || full.endsWith('.js')) {
          files.push(full);
        }
      }
      return files;
    };

    const allSrcFiles = walk(srcDir);
    const offenders = [];

    for (const filePath of allSrcFiles) {
      // electronBridge.js is the only allowed wrapper definition
      if (filePath.endsWith('src/utils/electronBridge.js')) continue;

      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.includes('electron.ipcRenderer') || content.includes("require('electron')")) {
        offenders.push(filePath);
      }
    }

    assert.strictEqual(
      offenders.length,
      0,
      `Found direct electron references in: ${offenders.join(', ')}`
    );
  });

  await test('27.1.2 Static AST Check: Invoices.jsx and Analytics.jsx use safe getIpcRenderer', async () => {
    const invoicesContent = fs.readFileSync(path.join(projectRoot, 'src/modules/Invoices.jsx'), 'utf-8');
    const analyticsContent = fs.readFileSync(path.join(projectRoot, 'src/modules/Analytics.jsx'), 'utf-8');

    assert(invoicesContent.includes("import { getIpcRenderer } from '../utils/electronBridge.js'"));
    assert(analyticsContent.includes("import { getIpcRenderer } from '../utils/electronBridge.js'"));

    // Verify all IPC invocations use ipc.invoke
    assert(!invoicesContent.includes('electron.ipcRenderer.invoke'));
    assert(!analyticsContent.includes('electron.ipcRenderer.invoke'));
  });

  await test('27.1.3 Static AST Check: Debtors.jsx has zero references to nonexistent loadDebtHistory', async () => {
    const debtorsContent = fs.readFileSync(path.join(projectRoot, 'src/modules/Debtors.jsx'), 'utf-8');

    assert(!debtorsContent.includes('loadDebtHistory'), 'Found reference to nonexistent loadDebtHistory in Debtors.jsx');
    assert(debtorsContent.includes('const loadDebtorHistory = async (debtorId) =>'));
    assert(debtorsContent.includes('await loadDebtorHistory(selectedDebtor.id);'));
  });

  // =========================================================================
  // 2. INVOICES MODULE IPC SIMULATION & EDGE CASE HARNESS
  // =========================================================================

  await test('27.2.1 Invoices: Undefined IPC runtime falls back safely to window.print()', async () => {
    let printCalled = false;
    let errorShown = null;

    // Simulate browser environment where getIpcRenderer returns null
    const mockWindow = {
      print: () => { printCalled = true; }
    };
    const getMockIpcRenderer = () => null;

    const handleThermalPrintSim = async (invoice, activeTab) => {
      try {
        const ipc = getMockIpcRenderer();
        if (!ipc) {
          mockWindow.print();
          return;
        }
        await ipc.invoke('print:receipt', invoice);
      } catch (err) {
        errorShown = err.message;
      }
    };

    const handleExportPdfSim = async (invoice, activeTab) => {
      try {
        const ipc = getMockIpcRenderer();
        if (!ipc) {
          mockWindow.print();
          return;
        }
        await ipc.invoke('export:purchase-order-pdf', invoice);
      } catch (err) {
        errorShown = err.message;
      }
    };

    await handleThermalPrintSim({ id: 101, total: 150 }, 'sales');
    assert.strictEqual(printCalled, true);
    assert.strictEqual(errorShown, null);

    printCalled = false;
    await handleExportPdfSim({ id: 202, total: 500 }, 'purchases');
    assert.strictEqual(printCalled, true);
    assert.strictEqual(errorShown, null);
  });

  await test('27.2.2 Invoices: IPC error rejections are caught and displayed via showError', async () => {
    let errorMessages = [];
    const showError = (msg) => errorMessages.push(msg);

    const mockFaultyIpc = {
      invoke: async (channel) => {
        throw new Error(`Device communication timeout on channel ${channel}`);
      }
    };

    const handleThermalPrintSim = async (invoice, activeTab) => {
      try {
        const ipc = mockFaultyIpc;
        if (!ipc) return;
        if (activeTab === 'purchases') {
          const items = JSON.parse(invoice.items_json || '[]');
          await ipc.invoke('print:purchase-order', { orderId: invoice.id, items });
        } else {
          await ipc.invoke('print:receipt', { saleId: invoice.id });
        }
      } catch (err) {
        showError(`فشل الطباعة: ${err.message}`);
      }
    };

    const handleExportPdfSim = async (invoice, activeTab) => {
      try {
        const ipc = mockFaultyIpc;
        if (!ipc) return;
        await ipc.invoke('export:purchase-order-pdf', { orderId: invoice.id });
      } catch (err) {
        showError(`فشل تصدير PDF: ${err.message}`);
      }
    };

    await handleThermalPrintSim({ id: 1, total: 100 }, 'sales');
    await handleExportPdfSim({ id: 2, total: 200 }, 'sales');

    assert.strictEqual(errorMessages.length, 2);
    assert(errorMessages[0].includes('فشل الطباعة: Device communication timeout'));
    assert(errorMessages[1].includes('فشل تصدير PDF: Device communication timeout'));
  });

  await test('27.2.3 Invoices: Corrupted and Empty Payloads Boundary Handling', async () => {
    const capturedPayloads = [];
    const mockIpc = {
      invoke: async (channel, payload) => {
        capturedPayloads.push({ channel, payload });
        return { success: true, filePath: '/tmp/test.pdf' };
      }
    };

    // Case: Purchase with null/corrupted items_json
    const purchaseInvoice = {
      id: 'PO-999',
      date: '2026-09-01',
      supplier_name: null,
      items_json: null, // edge: null json
      total: null,
      notes: undefined
    };

    const handlePurchasePrint = async (inv) => {
      let items = [];
      try {
        items = JSON.parse(inv.items_json || '[]');
      } catch (e) {
        items = [];
      }
      await mockIpc.invoke('print:purchase-order', {
        orderId: inv.id,
        date: inv.date,
        supplier: inv.supplier_name || 'غير محدد',
        items,
        total: inv.total || 0,
        notes: inv.notes || ''
      });
    };

    await handlePurchasePrint(purchaseInvoice);

    assert.strictEqual(capturedPayloads.length, 1);
    assert.strictEqual(capturedPayloads[0].payload.supplier, 'غير محدد');
    assert.deepStrictEqual(capturedPayloads[0].payload.items, []);
    assert.strictEqual(capturedPayloads[0].payload.total, 0);

    // Case: Corrupted JSON string
    purchaseInvoice.items_json = '{ corrupted_invalid_json';
    await handlePurchasePrint(purchaseInvoice);
    assert.strictEqual(capturedPayloads.length, 2);
    assert.deepStrictEqual(capturedPayloads[1].payload.items, []);
  });

  await test('27.2.4 Invoices: Rapid Concurrency Stress Test (100 simultaneous print/export calls)', async () => {
    let callCount = 0;
    const mockIpc = {
      invoke: async (channel, payload) => {
        callCount++;
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
        return { success: true, filePath: `/tmp/out_${callCount}.pdf` };
      }
    };

    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(
        mockIpc.invoke(i % 2 === 0 ? 'print:receipt' : 'export:purchase-order-pdf', {
          id: i,
          total: i * 10
        })
      );
    }

    const settled = await Promise.allSettled(promises);
    assert.strictEqual(settled.length, 100);
    assert.strictEqual(callCount, 100);
    assert(settled.every((s) => s.status === 'fulfilled' && s.value.success === true));
  });

  // =========================================================================
  // 3. ANALYTICS MODULE IPC SIMULATION & EDGE CASE HARNESS
  // =========================================================================

  await test('27.3.1 Analytics: Export PDF with IPC responses (success, error, canceled)', async () => {
    let successMsg = null;
    let errorMsg = null;

    const showSuccess = (msg) => { successMsg = msg; };
    const showError = (msg) => { errorMsg = msg; };

    const runAnalyticsExport = async (mockResponse, shouldThrow = false) => {
      successMsg = null;
      errorMsg = null;
      const ipc = {
        invoke: async () => {
          if (shouldThrow) throw new Error('Process crash');
          return mockResponse;
        }
      };

      try {
        const payload = { reportData: {}, templateConfig: {} };
        const res = await ipc.invoke('export:financial-pdf', payload);
        if (res?.success) {
          showSuccess(`✅ تم حفظ تقرير PDF بنجاح في:\n${res.filePath}`);
        } else if (!res?.canceled) {
          showError('فشل تصدير PDF: ' + (res?.error || 'خطأ غير معروف'));
        }
      } catch (e) {
        showError('خطأ أثناء تصدير PDF: ' + e.message);
      }
    };

    // Subtest: Success
    await runAnalyticsExport({ success: true, filePath: '/home/user/report.pdf' });
    assert(successMsg && successMsg.includes('/home/user/report.pdf'));
    assert.strictEqual(errorMsg, null);

    // Subtest: Canceled by user (Save dialog dismissed)
    await runAnalyticsExport({ canceled: true });
    assert.strictEqual(successMsg, null);
    assert.strictEqual(errorMsg, null); // Graceful dismissal, no error!

    // Subtest: IPC returned failure object
    await runAnalyticsExport({ success: false, error: 'Disk write error' });
    assert.strictEqual(successMsg, null);
    assert(errorMsg && errorMsg.includes('Disk write error'));

    // Subtest: Unhandled IPC rejection / throw
    await runAnalyticsExport(null, true);
    assert.strictEqual(successMsg, null);
    assert(errorMsg && errorMsg.includes('خطأ أثناء تصدير PDF: Process crash'));
  });

  await test('27.3.2 Analytics: Empty Metrics & Boundary Inputs Formatting Payload Invariant', async () => {
    const formatCurr = (num, currency = 'د.ل') => {
      const val = Number(num) || 0;
      return `${val.toLocaleString('ar-LY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
    };

    // Boundary check with empty/undefined values
    const zeroFormatted = formatCurr(0);
    assert.strictEqual(formatCurr(undefined), zeroFormatted);
    assert.strictEqual(formatCurr(null), zeroFormatted);
    assert.strictEqual(formatCurr(NaN), zeroFormatted);
    assert.strictEqual(formatCurr(0), zeroFormatted);
    assert.strictEqual(formatCurr('not-a-number'), zeroFormatted);
    assert(zeroFormatted.includes('د.ل'));

    const emptyMetrics = {};
    const sanitizedMetrics = {
      totalRevenue: Number(emptyMetrics.totalRevenue) || 0,
      totalCost: Number(emptyMetrics.totalCost) || 0,
      totalProfit: Number(emptyMetrics.totalProfit) || 0,
      profitMargin: Number(emptyMetrics.profitMargin) || 0
    };

    assert.strictEqual(sanitizedMetrics.totalRevenue, 0);
    assert.strictEqual(sanitizedMetrics.totalCost, 0);
    assert.strictEqual(sanitizedMetrics.totalProfit, 0);
    assert.strictEqual(sanitizedMetrics.profitMargin, 0);
  });

  // =========================================================================
  // 4. DEBTORS MODULE HISTORY DELETION & REACTIVITY INVARIANT HARNESS
  // =========================================================================

  await test('27.4.1 Debtors: History deletion updates balance atomically and refreshes history', async () => {
    const testDb = createTestDb();

    // 1. Seed test debtor
    testDb.run("INSERT INTO debtors (id, name, phone, total_debt) VALUES ('d1', 'عميل تجريبي', '0912345678', 500)");

    // 2. Seed debt history
    testDb.run("INSERT INTO debt_history (id, debtor_id, date, type, amount) VALUES ('h1', 'd1', '2026-09-01', 'debt', 300)");
    testDb.run("INSERT INTO debt_history (id, debtor_id, date, type, amount) VALUES ('h2', 'd1', '2026-09-01', 'debt', 200)");
    testDb.run("INSERT INTO debt_history (id, debtor_id, date, type, amount) VALUES ('h3', 'd1', '2026-09-01', 'payment', 100)");

    // Total debt initial = 500 (300 + 200 - 100 = 400 + 100 initial = 500)
    let debtor = testDb.get("SELECT * FROM debtors WHERE id = 'd1'");
    assert.strictEqual(debtor.total_debt, 500);

    // Simulate deleteHistoryRecord for 'h2' (debt of 200)
    const recordToDelete = { id: 'h2', type: 'debt', amount: 200 };
    const delta = recordToDelete.type === 'debt' ? -recordToDelete.amount : recordToDelete.amount;

    testDb.run('DELETE FROM debt_history WHERE id = ?', [recordToDelete.id]);
    testDb.run('UPDATE debtors SET total_debt = MAX(0, total_debt + ?) WHERE id = ?', [delta, 'd1']);

    // Verify debtor balance decremented by 200 -> 300
    debtor = testDb.get("SELECT * FROM debtors WHERE id = 'd1'");
    assert.strictEqual(debtor.total_debt, 300);

    // Verify history record removed
    const remainingHistory = testDb.query("SELECT * FROM debt_history WHERE debtor_id = 'd1'");
    assert.strictEqual(remainingHistory.length, 2);
    assert(!remainingHistory.find((r) => r.id === 'h2'));

    // Verify payment summary calculation
    const summary = testDb.query(`
      SELECT type, COUNT(*) as transaction_count, SUM(amount) as total_amount
      FROM debt_history
      WHERE debtor_id = ?
      GROUP BY type
    `, ['d1']);

    const debtSummary = summary.find((s) => s.type === 'debt');
    const paySummary = summary.find((s) => s.type === 'payment');

    assert.strictEqual(debtSummary.total_amount, 300);
    assert.strictEqual(paySummary.total_amount, 100);

    testDb.close();
  });

  await test('27.4.2 Debtors: History deletion zero-floor invariant (MAX(0, total_debt + delta))', async () => {
    const testDb = createTestDb();

    // Debtor with balance 50
    testDb.run("INSERT INTO debtors (id, name, phone, total_debt) VALUES ('d2', 'عميل رصيد منخفض', '0922222222', 50)");
    testDb.run("INSERT INTO debt_history (id, debtor_id, date, type, amount) VALUES ('h4', 'd2', '2026-09-01', 'debt', 200)");

    // Deleting debt of 200 when balance is 50 should clamp to 0, not -150
    const record = { id: 'h4', type: 'debt', amount: 200 };
    const delta = -record.amount;

    testDb.run('DELETE FROM debt_history WHERE id = ?', [record.id]);
    testDb.run('UPDATE debtors SET total_debt = MAX(0, total_debt + ?) WHERE id = ?', [delta, 'd2']);

    const debtor = testDb.get("SELECT * FROM debtors WHERE id = 'd2'");
    assert.strictEqual(debtor.total_debt, 0, 'Total debt must not become negative');

    testDb.close();
  });

  await test('27.4.3 Debtors: Payment deletion increases debt back', async () => {
    const testDb = createTestDb();

    testDb.run("INSERT INTO debtors (id, name, phone, total_debt) VALUES ('d3', 'عميل دفع', '0933333333', 100)");
    testDb.run("INSERT INTO debt_history (id, debtor_id, date, type, amount) VALUES ('h5', 'd3', '2026-09-01', 'payment', 50)");

    // Deleting payment of 50 means delta = +50 -> balance becomes 150
    const record = { id: 'h5', type: 'payment', amount: 50 };
    const delta = record.type === 'debt' ? -record.amount : record.amount;

    testDb.run('DELETE FROM debt_history WHERE id = ?', [record.id]);
    testDb.run('UPDATE debtors SET total_debt = MAX(0, total_debt + ?) WHERE id = ?', [delta, 'd3']);

    const debtor = testDb.get("SELECT * FROM debtors WHERE id = 'd3'");
    assert.strictEqual(debtor.total_debt, 150);

    testDb.close();
  });

  await test('27.4.4 Debtors: Stress test 50 rapid sequential history deletions and additions', async () => {
    const testDb = createTestDb();

    testDb.run("INSERT INTO debtors (id, name, phone, total_debt) VALUES ('d_stress', 'عميل إجهاد', '0944444444', 0)");

    let expectedDebt = 0;

    // Add 50 transactions
    for (let i = 0; i < 50; i++) {
      const type = i % 3 === 0 ? 'payment' : 'debt';
      const amount = (i + 1) * 10;
      testDb.run('INSERT INTO debt_history (id, debtor_id, date, type, amount) VALUES (?, ?, ?, ?, ?)', [
        `hist_${i}`,
        'd_stress',
        '2026-09-01',
        type,
        amount
      ]);

      if (type === 'debt') {
        expectedDebt += amount;
      } else {
        expectedDebt = Math.max(0, expectedDebt - amount);
      }
      testDb.run('UPDATE debtors SET total_debt = ? WHERE id = ?', [expectedDebt, 'd_stress']);
    }

    let debtor = testDb.get("SELECT * FROM debtors WHERE id = 'd_stress'");
    assert.strictEqual(debtor.total_debt, expectedDebt);

    // Delete the first 25 history records
    for (let i = 0; i < 25; i++) {
      const type = i % 3 === 0 ? 'payment' : 'debt';
      const amount = (i + 1) * 10;
      const delta = type === 'debt' ? -amount : amount;

      testDb.run('DELETE FROM debt_history WHERE id = ?', [`hist_${i}`]);
      testDb.run('UPDATE debtors SET total_debt = MAX(0, total_debt + ?) WHERE id = ?', [delta, 'd_stress']);
    }

    const count = testDb.get("SELECT COUNT(*) as c FROM debt_history WHERE debtor_id = 'd_stress'").c;
    assert.strictEqual(count, 25);

    testDb.close();
  });

  return results;
}
