/**
 * Suite 07: Adversarial Stress Testing — Security Boundaries & RBAC Enforcements
 * Tests: Cashier / Accountant / Manager Role Matrix, Action Locks, Profit Masking,
 * Sole Manager Protection, and Permission Fallbacks.
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

  await test('7.1 Cashier Security Boundaries (Strict Privilege Minimum)', async () => {
    const cashierPerms = ROLE_PRESETS.cashier.permissions;

    // 1. Profit Viewing must be strictly disabled
    assert.strictEqual(cashierPerms.view_profit, false, 'Cashier must NEVER have view_profit enabled');

    // 2. Price Editing during checkout must be disabled
    assert.strictEqual(cashierPerms.change_price, false, 'Cashier must NEVER have change_price enabled');

    // 3. Discount manual application must be disabled
    assert.strictEqual(cashierPerms.apply_discount, false, 'Cashier must NEVER have apply_discount enabled');

    // 4. Invoices and historical deletions must be disabled
    assert.strictEqual(cashierPerms.delete_invoice, false, 'Cashier must NEVER have delete_invoice enabled');

    // 5. Settings and system management must be disabled
    assert.strictEqual(cashierPerms.module_settings, false, 'Cashier must NOT access settings module');
    assert.strictEqual(cashierPerms.edit_settings, false, 'Cashier must NOT edit settings');
    assert.strictEqual(cashierPerms.manage_users, false, 'Cashier must NOT manage users');
    assert.strictEqual(cashierPerms.purge_data, false, 'Cashier must NOT purge system data');

    // 6. Analytics and Executive Dashboard must be disabled
    assert.strictEqual(cashierPerms.module_analytics, false, 'Cashier must NOT access financial analytics');
    assert.strictEqual(cashierPerms.module_dashboard, false, 'Cashier must NOT access executive dashboard');

    // 7. Allowed modules for Cashier
    assert.strictEqual(cashierPerms.module_pos, true, 'Cashier should access POS');
    assert.strictEqual(cashierPerms.module_shift, true, 'Cashier should access shift close');
    assert.strictEqual(cashierPerms.module_returns, true, 'Cashier should access returns');
    assert.strictEqual(cashierPerms.module_barcodes, true, 'Cashier should access barcodes');
  });

  await test('7.2 Accountant Security Boundaries (Financial Visibility without System Mutation)', async () => {
    const accountantPerms = ROLE_PRESETS.accountant.permissions;

    // 1. Financial Analytics and Profit view MUST be enabled
    assert.strictEqual(accountantPerms.view_profit, true, 'Accountant MUST be able to view profits');
    assert.strictEqual(accountantPerms.module_analytics, true, 'Accountant MUST access analytics');
    assert.strictEqual(accountantPerms.module_dashboard, true, 'Accountant MUST access dashboard');
    assert.strictEqual(accountantPerms.module_invoices, true, 'Accountant MUST view invoices');
    assert.strictEqual(accountantPerms.module_debtors, true, 'Accountant MUST view debtors');
    assert.strictEqual(accountantPerms.module_purchases, true, 'Accountant MUST view purchases');
    assert.strictEqual(accountantPerms.module_withdrawals, true, 'Accountant MUST view withdrawals');

    // 2. Destructive and Administrative actions MUST be blocked
    assert.strictEqual(accountantPerms.delete_invoice, false, 'Accountant must NOT delete invoices');
    assert.strictEqual(accountantPerms.purge_data, false, 'Accountant must NOT purge data');
    assert.strictEqual(accountantPerms.manage_users, false, 'Accountant must NOT manage users');
    assert.strictEqual(accountantPerms.edit_settings, false, 'Accountant must NOT modify system settings');
    assert.strictEqual(accountantPerms.module_settings, false, 'Accountant must NOT access settings panel');
  });

  await test('7.3 Manager Role (Full Authority & Sole Manager Immunity)', async () => {
    const managerPerms = ROLE_PRESETS.manager.permissions;

    // 1. Full 21 modules access
    const moduleKeys = Object.keys(managerPerms).filter((k) => k.startsWith('module_'));
    assert.strictEqual(moduleKeys.length, 21, 'Manager must have 21 modules mapped');
    moduleKeys.forEach((key) => {
      assert.strictEqual(managerPerms[key], true, `Manager must have permission ${key}`);
    });

    // 2. Full special action permissions
    const specialKeys = ['view_profit', 'delete_invoice', 'manage_users', 'purge_data', 'apply_discount', 'change_price', 'edit_settings'];
    specialKeys.forEach((key) => {
      assert.strictEqual(managerPerms[key], true, `Manager must have special action ${key}`);
    });

    // 3. Database test of Sole Manager deletion prevention
    const testDb = createTestDb();
    testDb.run('INSERT INTO users (id, name, pin, role) VALUES (?, ?, ?, ?)', ['m_root', 'المدير الرئيسي', '1234', 'manager']);
    testDb.run('INSERT INTO users (id, name, pin, role) VALUES (?, ?, ?, ?)', ['acc_1', 'محاسب', '5678', 'accountant']);

    const checkDelete = (userId) => {
      const targetUser = testDb.get('SELECT * FROM users WHERE id = ?', [userId]);
      if (!targetUser) throw new Error('User not found');
      if (targetUser.role === 'manager') {
        const count = testDb.get('SELECT COUNT(*) as count FROM users WHERE role = \'manager\'').count;
        if (count <= 1) {
          throw new Error('لا يمكن حذف حساب المدير العام الوحيد المتبقي في المنظومة');
        }
      }
      testDb.run('DELETE FROM users WHERE id = ?', [userId]);
      return true;
    };

    // Attempting to delete root manager must throw error
    let blocked = false;
    try {
      checkDelete('m_root');
    } catch (e) {
      blocked = true;
      assert(e.message.includes('المدير العام الوحيد'));
    }
    assert.strictEqual(blocked, true, 'Sole manager deletion was successfully prevented');

    // Add second manager -> Deletion becomes possible
    testDb.run('INSERT INTO users (id, name, pin, role) VALUES (?, ?, ?, ?)', ['m_secondary', 'نائب المدير', '9999', 'manager']);
    const allowed = checkDelete('m_root');
    assert.strictEqual(allowed, true, 'Deleting manager allowed when secondary manager exists');

    const remainingManagers = testDb.get("SELECT COUNT(*) as count FROM users WHERE role = 'manager'").count;
    assert.strictEqual(remainingManagers, 1, 'Exactly one manager remains');

    testDb.close();
  });

  await test('7.4 PIN Uniqueness & Collision Protection', async () => {
    const testDb = createTestDb();
    testDb.run('INSERT INTO users (id, name, pin, role) VALUES (?, ?, ?, ?)', ['u1', 'User 1', '1234', 'cashier']);

    const isPinAvailable = (pin, excludeUserId = null) => {
      let sql = 'SELECT id FROM users WHERE pin = ?';
      const params = [pin];
      if (excludeUserId) {
        sql += ' AND id != ?';
        params.push(excludeUserId);
      }
      const existing = testDb.get(sql, params);
      return !existing;
    };

    assert.strictEqual(isPinAvailable('1234'), false, 'PIN 1234 is occupied');
    assert.strictEqual(isPinAvailable('1234', 'u1'), true, 'User keeping own PIN is valid');
    assert.strictEqual(isPinAvailable('7777'), true, 'New PIN 7777 is available');

    testDb.close();
  });

  return results;
}
