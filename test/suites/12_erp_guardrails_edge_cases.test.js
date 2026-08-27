/**
 * Suite 12: Desktop ERP Troubleshooting Patterns & Edge Case Guardrails
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

  await test('12.1 SQLite ISO Date String Comparison Guardrail', async () => {
    const testDb = createTestDb();

    // Insert records in 2026
    testDb.run('INSERT INTO sales (id, date, total) VALUES (?, ?, ?)', [1, '2026-08-27T10:00:00.000Z', 100]);

    // Flawed infinite upper bound: new Date(8640000000000000).toISOString() -> '+275760...'
    const flawedBound = '+275760-09-13T00:00:00.000Z';
    const flawedResult = testDb.query('SELECT * FROM sales WHERE date <= ?', [flawedBound]);
    // Note: in ASCII, '+' (43) < '2' (50), so this returns 0 records!
    assert.strictEqual(flawedResult.length, 0, 'ASCII collation trap confirmed: "+" is less than "2"');

    // Correct forward upper bound
    const correctBound = '2026-12-31T23:59:59.999Z';
    const correctResult = testDb.query('SELECT * FROM sales WHERE date <= ?', [correctBound]);
    assert.strictEqual(correctResult.length, 1, 'Standard upper bound correctly matches 2026 records');

    testDb.close();
  });

  await test('12.2 AI Endpoint Normalization Guardrail', async () => {
    function normalizeApiEndpoint(rawUrl) {
      let clean = (rawUrl || '').trim().replace(/\/+$/, '');
      if (!clean.endsWith('/chat/completions') && !clean.includes('generateContent')) {
        clean = `${clean}/chat/completions`;
      }
      return clean;
    }

    assert.strictEqual(
      normalizeApiEndpoint('https://openrouter.ai/api/v1'),
      'https://openrouter.ai/api/v1/chat/completions'
    );
    assert.strictEqual(
      normalizeApiEndpoint('https://api.deepseek.com/v1/'),
      'https://api.deepseek.com/v1/chat/completions'
    );
    assert.strictEqual(
      normalizeApiEndpoint('https://api.openai.com/v1/chat/completions'),
      'https://api.openai.com/v1/chat/completions'
    );
    assert.strictEqual(
      normalizeApiEndpoint('https://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent'),
      'https://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent'
    );
  });

  await test('12.3 Self-Healing Missing Column Sanitization', async () => {
    const testDb = createTestDb();

    // Table has columns: id, name, category, qty, cost, price
    // Payload contains unknown column: 'non_existent_color'
    const payload = {
      id: 'item_test_col',
      name: 'عطر الفل',
      category: 'زهور',
      qty: 10,
      cost: 5,
      price: 15,
      non_existent_color: 'red'
    };

    function safeInsert(data) {
      const keys = Object.keys(data);
      const values = Object.values(data);
      const placeholders = keys.map(() => '?').join(', ');
      const sql = `INSERT INTO inventory (${keys.join(', ')}) VALUES (${placeholders})`;

      try {
        return testDb.run(sql, values);
      } catch (err) {
        const match = err.message && err.message.match(/has no column named (\w+)/i);
        if (match && match[1] && data[match[1]] !== undefined) {
          const nextData = { ...data };
          delete nextData[match[1]];
          return safeInsert(nextData);
        }
        throw err;
      }
    }

    safeInsert(payload);

    const inserted = testDb.get("SELECT * FROM inventory WHERE id = 'item_test_col'");
    assert(inserted, 'Record should be successfully inserted by dropping the missing column');
    assert.strictEqual(inserted.name, 'عطر الفل');

    testDb.close();
  });

  return results;
}
