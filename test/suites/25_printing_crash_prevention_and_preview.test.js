/**
 * Suite 25: Printing Crash Prevention & Modal Preview Architecture
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

  await test('25.1 Financial currency and Arabic receipt numbers format safely', async () => {
    const formatCurrency = (amount, symbol = 'د.ل') => {
      const val = Number(amount) || 0;
      return `${val.toLocaleString('ar-LY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${symbol}`;
    };

    assert(formatCurrency(1500).includes('د.ل'));
    assert(formatCurrency(0).includes('0') || formatCurrency(0).includes('٠'));
    assert(formatCurrency(null).includes('0') || formatCurrency(null).includes('٠'));
    assert(formatCurrency(undefined).includes('0') || formatCurrency(undefined).includes('٠'));
    assert(formatCurrency('abc').includes('0') || formatCurrency('abc').includes('٠'));
  });

  await test('25.2 Receipt items calculation and discount integrity', async () => {
    const items = [
      { name: 'عطر مسك', cart_qty: 2, final_price: 50 },
      { name: 'دهن عود', cart_qty: 1, final_price: 120 }
    ];

    const subtotal = items.reduce((sum, item) => sum + item.cart_qty * item.final_price, 0);
    const discount = 10;
    const total = subtotal - (subtotal * discount / 100);

    assert.strictEqual(subtotal, 220);
    assert.strictEqual(total, 198);
  });

  await test('25.3 Purchase order items mapping and fallback costs', async () => {
    const items = [
      { name: 'زجاجات فارغة 50مل', quantity: 100, cost_per_unit: 1.5, total_cost: 150 },
      { name: 'كحول إيثيلي 96%', quantity: 5, cost: 40 }
    ];

    const mapped = items.map((item, index) => {
      const qty = item.quantity || 0;
      const unitCost = item.cost_per_unit || item.cost || 0;
      const totalCost = item.total_cost || (qty * unitCost);
      return { index: index + 1, name: item.name, qty, unitCost, totalCost };
    });

    assert.strictEqual(mapped[0].totalCost, 150);
    assert.strictEqual(mapped[1].totalCost, 200);
  });

  await test('25.4 Inventory report aggregations under zero-stock and edge cases', async () => {
    const products = [
      { name: 'عطر 1', qty: 5, cost: 20, price: 40 },
      { name: 'عطر 2', qty: 0, cost: 30, price: 60 },
      { name: 'عطر 3', qty: 25, cost: 10, price: 20 }
    ];

    const totalCost = products.reduce((sum, p) => sum + (p.qty * p.cost), 0);
    const totalRetail = products.reduce((sum, p) => sum + (p.qty * p.price), 0);
    const lowStockCount = products.filter(p => p.qty <= 10).length;

    assert.strictEqual(totalCost, 350);
    assert.strictEqual(totalRetail, 700);
    assert.strictEqual(lowStockCount, 2);
  });

  return results;
}
