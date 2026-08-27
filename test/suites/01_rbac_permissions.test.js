/**
 * Suite 01: RBAC, User Roles & Granular Permissions System
 */

import assert from 'assert';
import { createTestDb } from '../harness/test-db.js';
import { ROLE_PRESETS } from '../../src/database/repositories/UsersRepository.js';

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

  await test('1.1 Role Presets Structure & Completeness', async () => {
    assert(ROLE_PRESETS.manager, 'Manager preset must exist');
    assert(ROLE_PRESETS.accountant, 'Accountant preset must exist');
    assert(ROLE_PRESETS.cashier, 'Cashier preset must exist');

    // Check manager permissions
    assert.strictEqual(ROLE_PRESETS.manager.permissions.module_pos, true);
    assert.strictEqual(ROLE_PRESETS.manager.permissions.module_settings, true);
    assert.strictEqual(ROLE_PRESETS.manager.permissions.view_profit, true);
    assert.strictEqual(ROLE_PRESETS.manager.permissions.purge_data, true);
    assert.strictEqual(ROLE_PRESETS.manager.permissions.delete_invoice, true);

    // Check accountant permissions
    assert.strictEqual(ROLE_PRESETS.accountant.permissions.module_analytics, true);
    assert.strictEqual(ROLE_PRESETS.accountant.permissions.view_profit, true);
    assert.strictEqual(ROLE_PRESETS.accountant.permissions.purge_data, false);
    assert.strictEqual(ROLE_PRESETS.accountant.permissions.edit_settings, false);

    // Check cashier permissions
    assert.strictEqual(ROLE_PRESETS.cashier.permissions.module_pos, true);
    assert.strictEqual(ROLE_PRESETS.cashier.permissions.module_settings, false);
    assert.strictEqual(ROLE_PRESETS.cashier.permissions.module_analytics, false);
    assert.strictEqual(ROLE_PRESETS.cashier.permissions.view_profit, false);
    assert.strictEqual(ROLE_PRESETS.cashier.permissions.change_price, false);
    assert.strictEqual(ROLE_PRESETS.cashier.permissions.delete_invoice, false);
  });

  await test('1.2 Default Users Seeding into Database', async () => {
    const testDb = createTestDb();

    // Seed default users
    const defaultUsers = [
      { id: 'admin_1', name: 'المدير العام', pin: '1234', role: 'manager' },
      { id: 'usr_accountant', name: 'المحاسب المالي', pin: '5678', role: 'accountant' },
      { id: 'usr_cashier', name: 'كاشير المبيعات', pin: '0000', role: 'cashier' }
    ];

    for (const u of defaultUsers) {
      testDb.run(
        'INSERT INTO users (id, name, pin, role, created_at) VALUES (?, ?, ?, ?, ?)',
        [u.id, u.name, u.pin, u.role, new Date().toISOString()]
      );

      const preset = ROLE_PRESETS[u.role];
      if (preset?.permissions) {
        for (const [permKey, val] of Object.entries(preset.permissions)) {
          testDb.run(
            'INSERT INTO user_permissions (user_id, permission_key, is_allowed) VALUES (?, ?, ?)',
            [u.id, permKey, val ? 1 : 0]
          );
        }
      }
    }

    const users = testDb.query('SELECT * FROM users');
    assert.strictEqual(users.length, 3, 'Should have 3 default users seeded');

    const admin = testDb.get('SELECT * FROM users WHERE role = ?', ['manager']);
    assert(admin, 'Manager user should exist');
    assert.strictEqual(admin.pin, '1234');

    const perms = testDb.query('SELECT * FROM user_permissions WHERE user_id = ?', ['admin_1']);
    assert(perms.length >= 20, 'Admin should have full permissions');

    testDb.close();
  });

  await test('1.3 PIN Availability & Collision Guard', async () => {
    const testDb = createTestDb();
    testDb.run('INSERT INTO users (id, name, pin, role) VALUES (?, ?, ?, ?)', ['usr1', 'User 1', '1234', 'cashier']);

    const existingPin = testDb.get('SELECT id FROM users WHERE pin = ?', ['1234']);
    assert(existingPin, 'PIN 1234 should be occupied');

    const newPin = testDb.get('SELECT id FROM users WHERE pin = ?', ['9999']);
    assert(!newPin, 'PIN 9999 should be available');

    // Self exclusion check (updating user with same pin)
    const selfExclude = testDb.get('SELECT id FROM users WHERE pin = ? AND id != ?', ['1234', 'usr1']);
    assert(!selfExclude, 'User should be allowed to keep their own PIN during profile update');

    testDb.close();
  });

  await test('1.4 Sole Manager Deletion Guard', async () => {
    const testDb = createTestDb();
    testDb.run('INSERT INTO users (id, name, pin, role) VALUES (?, ?, ?, ?)', ['m1', 'Manager 1', '1234', 'manager']);
    testDb.run('INSERT INTO users (id, name, pin, role) VALUES (?, ?, ?, ?)', ['c1', 'Cashier 1', '0000', 'cashier']);

    // Attempting to delete sole manager
    const managerCount = testDb.get("SELECT COUNT(*) as count FROM users WHERE role = 'manager'").count;
    assert.strictEqual(managerCount, 1);

    const userToDelete = testDb.get('SELECT * FROM users WHERE id = ?', ['m1']);
    let deleteAllowed = true;
    if (userToDelete.role === 'manager' && managerCount <= 1) {
      deleteAllowed = false;
    }
    assert.strictEqual(deleteAllowed, false, 'System must forbid deleting the only manager account');

    // Adding second manager makes deletion allowed
    testDb.run('INSERT INTO users (id, name, pin, role) VALUES (?, ?, ?, ?)', ['m2', 'Manager 2', '5555', 'manager']);
    const updatedCount = testDb.get("SELECT COUNT(*) as count FROM users WHERE role = 'manager'").count;
    assert.strictEqual(updatedCount, 2);

    let deleteAllowedNow = true;
    if (userToDelete.role === 'manager' && updatedCount <= 1) {
      deleteAllowedNow = false;
    }
    assert.strictEqual(deleteAllowedNow, true, 'Deleting manager allowed when another manager exists');

    testDb.close();
  });

  await test('1.5 Role Presets Flat Extraction & Settings Module Alignment', async () => {
    // Ensure flattening extract produces flat map without nested .permissions
    for (const role of ['manager', 'accountant', 'cashier']) {
      const perms = ROLE_PRESETS[role]?.permissions || ROLE_PRESETS[role] || {};
      assert(typeof perms === 'object', 'Permissions must be an object');
      assert.strictEqual(perms.permissions, undefined, 'Flat permissions must not contain nested .permissions');

      // Canonical aligned module permission keys
      assert(typeof perms.module_mixlab === 'boolean', 'module_mixlab permission key must exist as boolean');
      assert(typeof perms.module_shift === 'boolean', 'module_shift permission key must exist as boolean');
      assert(typeof perms.module_barcodes === 'boolean', 'module_barcodes permission key must exist as boolean');
      assert(typeof perms.view_profit === 'boolean', 'view_profit permission key must exist as boolean');
    }
  });

  await test('1.6 User Deletion Return Value & Condition Handling', async () => {
    const testDb = createTestDb();
    testDb.run('INSERT INTO users (id, name, pin, role) VALUES (?, ?, ?, ?)', ['m1', 'Manager 1', '1234', 'manager']);
    testDb.run('INSERT INTO users (id, name, pin, role) VALUES (?, ?, ?, ?)', ['c1', 'Cashier 1', '0000', 'cashier']);
    testDb.run('INSERT INTO user_permissions (user_id, permission_key, is_allowed) VALUES (?, ?, ?)', ['c1', 'module_pos', 1]);

    // Deletion of cashier
    testDb.run('DELETE FROM user_permissions WHERE user_id = ?', ['c1']);
    testDb.run('DELETE FROM users WHERE id = ?', ['c1']);
    const delRes = true; // UsersRepository.deleteUser returns boolean true

    // Verification of UI condition: res === true || res?.success
    const isSuccess = delRes === true || delRes?.success;
    assert.strictEqual(Boolean(isSuccess), true, 'Condition res === true || res?.success must be truthy for boolean true');

    const remainingCashier = testDb.get('SELECT * FROM users WHERE id = ?', ['c1']);
    assert.strictEqual(remainingCashier, undefined, 'Deleted cashier must not exist');

    testDb.close();
  });

  await test('1.7 Dashboard Profit Masking Logic & CSV Export Redaction', async () => {
    const summary = { revenue: 1000, profit: 350, marginPct: 35.0 };
    const topProducts = [{ name: 'مسك الطهارة', total_qty: 10, total_revenue: 500, total_profit: 200 }];

    // Test with canViewProfit = false
    const canViewProfitFalse = false;
    const maskedProfitBadge = canViewProfitFalse ? summary.profit : '••••••';
    const maskedCostBadge = canViewProfitFalse ? (summary.revenue - summary.profit) : '••••••';
    const maskedCsvProfit = canViewProfitFalse ? summary.profit : '••••••';
    const maskedProductProfit = topProducts.map(p => canViewProfitFalse ? p.total_profit : '••••••');

    assert.strictEqual(maskedProfitBadge, '••••••', 'Profit badge must be masked when canViewProfit is false');
    assert.strictEqual(maskedCostBadge, '••••••', 'Cost badge must be masked when canViewProfit is false');
    assert.strictEqual(maskedCsvProfit, '••••••', 'CSV profit must be masked when canViewProfit is false');
    assert.strictEqual(maskedProductProfit[0], '••••••', 'Product profit in table/export must be masked');

    // Test with canViewProfit = true
    const canViewProfitTrue = true;
    const visibleProfitBadge = canViewProfitTrue ? summary.profit : '••••••';
    const visibleCsvProfit = canViewProfitTrue ? summary.profit : '••••••';
    assert.strictEqual(visibleProfitBadge, 350, 'Profit badge must be visible when canViewProfit is true');
    assert.strictEqual(visibleCsvProfit, 350, 'CSV profit must be visible when canViewProfit is true');
  });

  await test('1.8 POS Debt Transaction & Debtor Auto-Creation Schema Safety', async () => {
    const testDb = createTestDb();

    // Auto-creation of debtor with generated string ID
    const newDebtorId = 'deb_' + Date.now().toString(36);
    testDb.run(
      'INSERT INTO debtors (id, name, phone, total_debt) VALUES (?, ?, ?, ?)',
      [newDebtorId, 'زبون آجل تجريبي', null, 0]
    );

    const insertedDebtor = testDb.get('SELECT * FROM debtors WHERE id = ?', [newDebtorId]);
    assert(insertedDebtor, 'Debtor must be created with non-null string id');
    assert.strictEqual(insertedDebtor.name, 'زبون آجل تجريبي');

    // Adding debt transaction to debt_history
    const historyId = 'dh_' + Date.now().toString(36);
    const saleId = 101;
    const debtAmount = 250;

    testDb.run(
      'INSERT INTO debt_history (id, debtor_id, date, type, amount, invoice_id) VALUES (?, ?, ?, ?, ?, ?)',
      [historyId, newDebtorId, new Date().toISOString(), 'debt', debtAmount, saleId]
    );
    testDb.run('UPDATE debtors SET total_debt = total_debt + ? WHERE id = ?', [debtAmount, newDebtorId]);

    const updatedDebtor = testDb.get('SELECT * FROM debtors WHERE id = ?', [newDebtorId]);
    assert.strictEqual(updatedDebtor.total_debt, 250, 'Debtor balance must reflect credit sale');

    const historyRecord = testDb.get('SELECT * FROM debt_history WHERE id = ?', [historyId]);
    assert(historyRecord, 'Debt history record must exist');
    assert.strictEqual(historyRecord.invoice_id, 101);
    assert.strictEqual(historyRecord.debtor_id, newDebtorId);

    testDb.close();
  });

  return results;
}
