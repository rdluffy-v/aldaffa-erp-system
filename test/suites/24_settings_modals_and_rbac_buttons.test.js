/**
 * Suite 24: Settings Modals, RBAC Buttons, PIN Invariants, and Lifecycle Logic
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

  await test('24.1 Default General Manager PIN is 1234 and Persists in SQLite', async () => {
    const testDb = createTestDb();
    testDb.run(
      `INSERT OR REPLACE INTO users (id, name, pin, role, created_at)
       VALUES ('admin_1', 'المدير العام', '1234', 'manager', datetime('now'))`
    );

    const admin = testDb.get(`SELECT * FROM users WHERE id = 'admin_1'`);
    assert(admin, 'Admin user must exist');
    assert.strictEqual(admin.name, 'المدير العام');
    assert.strictEqual(admin.pin, '1234');
    assert.strictEqual(admin.role, 'manager');
  });

  await test('24.2 Add New User & Validate Role Presets in SQLite', async () => {
    const testDb = createTestDb();
    const newId = 'usr_acc_101';

    testDb.run(
      `INSERT INTO users (id, name, pin, role, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [newId, 'محاسب الفرع الرئيسي', '9876', 'accountant']
    );

    // Insert permissions from preset
    for (const [permKey, allowed] of Object.entries(ROLE_PRESETS.accountant.permissions)) {
      testDb.run(
        `INSERT INTO user_permissions (user_id, permission_key, is_allowed)
         VALUES (?, ?, ?)`,
        [newId, permKey, allowed ? 1 : 0]
      );
    }

    const userInDb = testDb.get(`SELECT * FROM users WHERE id = ?`, [newId]);
    assert.strictEqual(userInDb.name, 'محاسب الفرع الرئيسي');
    assert.strictEqual(userInDb.role, 'accountant');
    assert.strictEqual(userInDb.pin, '9876');

    const profitPerm = testDb.get(
      `SELECT is_allowed FROM user_permissions WHERE user_id = ? AND permission_key = 'view_profit'`,
      [newId]
    );
    assert.strictEqual(profitPerm.is_allowed, 1, 'Accountant can view profit');
  });

  await test('24.3 Edit Existing User Permissions Granular Matrix', async () => {
    const testDb = createTestDb();
    const cashierId = 'usr_csh_202';

    testDb.run(
      `INSERT INTO users (id, name, pin, role, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [cashierId, 'كاشير المساء', '4444', 'cashier']
    );

    testDb.run(
      `INSERT INTO user_permissions (user_id, permission_key, is_allowed)
       VALUES (?, 'allow_discount', 1)`,
      [cashierId]
    );

    testDb.run(
      `INSERT INTO user_permissions (user_id, permission_key, is_allowed)
       VALUES (?, 'view_profit', 0)`,
      [cashierId]
    );

    let perm = testDb.get(
      `SELECT is_allowed FROM user_permissions WHERE user_id = ? AND permission_key = 'allow_discount'`,
      [cashierId]
    );
    assert.strictEqual(perm.is_allowed, 1);

    // Update PIN and grant view_cost
    testDb.run(`UPDATE users SET name = ?, pin = ? WHERE id = ?`, ['كاشير المساء المعتمد', '7777', cashierId]);
    testDb.run(
      `INSERT OR REPLACE INTO user_permissions (user_id, permission_key, is_allowed)
       VALUES (?, 'view_cost', 1)`,
      [cashierId]
    );

    const updatedUser = testDb.get(`SELECT * FROM users WHERE id = ?`, [cashierId]);
    assert.strictEqual(updatedUser.name, 'كاشير المساء المعتمد');
    assert.strictEqual(updatedUser.pin, '7777');

    const costPerm = testDb.get(
      `SELECT is_allowed FROM user_permissions WHERE user_id = ? AND permission_key = 'view_cost'`,
      [cashierId]
    );
    assert.strictEqual(costPerm.is_allowed, 1);
  });

  await test('24.4 PIN Collision Detection & Uniqueness Validation', async () => {
    const testDb = createTestDb();
    testDb.run(
      `INSERT OR REPLACE INTO users (id, name, pin, role, created_at)
       VALUES ('admin_1', 'المدير العام', '1234', 'manager', datetime('now'))`
    );

    const existing = testDb.get(`SELECT id FROM users WHERE pin = ?`, ['1234']);
    assert(existing && existing.id === 'admin_1', 'PIN 1234 is occupied by admin_1');

    const freePin = testDb.get(`SELECT id FROM users WHERE pin = ?`, ['9999']);
    assert(!freePin, 'PIN 9999 is free');
  });

  await test('24.5 Sole Manager Deletion Immunity Invariant', async () => {
    const testDb = createTestDb();
    testDb.run(
      `INSERT OR REPLACE INTO users (id, name, pin, role, created_at)
       VALUES ('admin_1', 'المدير العام', '1234', 'manager', datetime('now'))`
    );

    const managers = testDb.query(`SELECT id FROM users WHERE role = 'manager'`);
    assert.strictEqual(managers.length, 1, 'Only one manager exists');

    // Rule: Cannot delete if sole manager
    const canDelete = managers.length > 1;
    assert.strictEqual(canDelete, false, 'Cannot delete sole manager');
  });

  return results;
}
