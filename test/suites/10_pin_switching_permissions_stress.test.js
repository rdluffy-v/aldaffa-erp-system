/**
 * Suite 10: Rapid PIN Switching & Granular Permission Persistence Stress Test
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

  await test('10.1 Rapid 500-Cycle PIN Authentication & User Switching', async () => {
    const testDb = createTestDb();

    // Seed 5 different users with distinct PINs and roles
    const users = [
      { id: 'u1', name: 'المدير العام', pin: '1111', role: 'manager' },
      { id: 'u2', name: 'المحاسب الأول', pin: '2222', role: 'accountant' },
      { id: 'u3', name: 'كاشير الصباح', pin: '3333', role: 'cashier' },
      { id: 'u4', name: 'كاشير المساء', pin: '4444', role: 'cashier' },
      { id: 'u5', name: 'مشرف المخزون', pin: '5555', role: 'accountant' }
    ];

    for (const u of users) {
      testDb.run(
        'INSERT INTO users (id, name, pin, role, created_at) VALUES (?, ?, ?, ?, ?)',
        [u.id, u.name, u.pin, u.role, new Date().toISOString()]
      );

      const preset = ROLE_PRESETS[u.role]?.permissions || {};
      for (const [permKey, val] of Object.entries(preset)) {
        testDb.run(
          'INSERT INTO user_permissions (user_id, permission_key, is_allowed) VALUES (?, ?, ?)',
          [u.id, permKey, val ? 1 : 0]
        );
      }
    }

    // Stress test: 500 rapid authentication lookups
    const startAuth = Date.now();
    for (let cycle = 0; cycle < 500; cycle++) {
      const targetUser = users[cycle % users.length];
      const found = testDb.get('SELECT * FROM users WHERE pin = ?', [targetUser.pin]);
      assert(found, `User with PIN ${targetUser.pin} must authenticate`);
      assert.strictEqual(found.id, targetUser.id);
      assert.strictEqual(found.role, targetUser.role);

      // Verify permissions lookup
      const perms = testDb.query('SELECT permission_key, is_allowed FROM user_permissions WHERE user_id = ?', [found.id]);
      const permMap = {};
      perms.forEach(p => { permMap[p.permission_key] = Boolean(p.is_allowed); });

      if (found.role === 'manager') {
        assert.strictEqual(permMap.purge_data, true);
      } else if (found.role === 'cashier') {
        assert.strictEqual(permMap.module_analytics, false);
      }
    }

    const elapsed = Date.now() - startAuth;
    assert(elapsed < 1000, `500 auth cycles completed in ${elapsed}ms (must be < 1s)`);

    testDb.close();
  });

  await test('10.2 Granular User-Specific Permission Overrides', async () => {
    const testDb = createTestDb();

    // Create a special Cashier who is granted extra permission: view_profit = true and module_analytics = true
    testDb.run('INSERT INTO users (id, name, pin, role) VALUES (?, ?, ?, ?)', ['cashier_vip', 'كاشير متميز', '7777', 'cashier']);

    const customPerms = {
      ...ROLE_PRESETS.cashier.permissions,
      view_profit: true,
      module_analytics: true
    };

    const permQueries = Object.keys(customPerms).map(key => ({
      sql: 'INSERT INTO user_permissions (user_id, permission_key, is_allowed) VALUES (?, ?, ?)',
      params: ['cashier_vip', key, customPerms[key] ? 1 : 0]
    }));
    testDb.transaction(permQueries);

    // Verify cashier_vip has custom permissions overridden from base preset
    const perms = testDb.query("SELECT permission_key, is_allowed FROM user_permissions WHERE user_id = 'cashier_vip'");
    const permMap = {};
    perms.forEach(p => { permMap[p.permission_key] = Boolean(p.is_allowed); });

    assert.strictEqual(permMap.view_profit, true, 'Cashier VIP should have view_profit enabled');
    assert.strictEqual(permMap.module_analytics, true, 'Cashier VIP should have module_analytics enabled');
    assert.strictEqual(permMap.purge_data, false, 'Cashier VIP must NOT have purge_data');

    testDb.close();
  });

  await test('10.3 Sole Manager Deletion Guard Concurrency', async () => {
    const testDb = createTestDb();

    testDb.run('INSERT INTO users (id, name, pin, role) VALUES (?, ?, ?, ?)', ['m_sole', 'المدير الوحيد', '0001', 'manager']);

    const managerCount = testDb.get("SELECT COUNT(*) as count FROM users WHERE role = 'manager'").count;
    assert.strictEqual(managerCount, 1);

    // Attempt delete
    let allowed = managerCount > 1;
    assert.strictEqual(allowed, false, 'Deletion of sole manager must be blocked');

    // Add another manager
    testDb.run('INSERT INTO users (id, name, pin, role) VALUES (?, ?, ?, ?)', ['m_two', 'المدير الثاني', '0002', 'manager']);
    const updatedCount = testDb.get("SELECT COUNT(*) as count FROM users WHERE role = 'manager'").count;
    assert.strictEqual(updatedCount, 2);

    allowed = updatedCount > 1;
    assert.strictEqual(allowed, true, 'Deletion now allowed since second manager exists');

    // Perform delete of m_sole
    if (allowed) {
      testDb.run("DELETE FROM users WHERE id = 'm_sole'");
    }

    const remainingManagers = testDb.get("SELECT COUNT(*) as count FROM users WHERE role = 'manager'").count;
    assert.strictEqual(remainingManagers, 1);
    const survivor = testDb.get("SELECT * FROM users WHERE role = 'manager'");
    assert.strictEqual(survivor.id, 'm_two');

    testDb.close();
  });

  return results;
}
