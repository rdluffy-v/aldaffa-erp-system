/**
 * ============================================================================
 * SANDBOX ENGINE - REALISTIC MOCK DATA SEEDER & SAFE CLEANUP
 * ============================================================================
 */

import { db } from './connection.js';
import { generateId } from '../utils/helpers.js';

export class SandboxEngine {
  /**
   * Check if sandbox demo data is currently active
   */
  static async isSandboxActive() {
    try {
      const res = await db.get("SELECT COUNT(*) as count FROM inventory WHERE is_demo = 1");
      return (res?.count || 0) > 0;
    } catch (e) {
      return false;
    }
  }

  /**
   * Seed realistic mock data tagged with is_demo = 1
   */
  static async seedDemoData() {
    // 1. Ensure is_demo column exists in relevant tables
    const tables = ['inventory', 'sales', 'sale_items', 'debtors', 'debt_history', 'purchases', 'shift_reports'];
    for (const table of tables) {
      try {
        await db.execute(`ALTER TABLE ${table} ADD COLUMN is_demo INTEGER DEFAULT 0`);
      } catch (e) {
        // column already exists, safe to ignore
      }
    }

    const queries = [];
    const now = new Date();

    // 2. Demo Products
    const demoProducts = [
      { name: 'عطر مسك الدفة الملكي 100ml', category: 'عطور شرقية', cost: 45, price: 95, qty: 35, unit: 'قطعة', barcode: 'DEMO-MSK-01' },
      { name: 'عطر صندل وعنبر إشبيليا 50ml', category: 'عطور غربية', cost: 60, price: 130, qty: 24, unit: 'قطعة', barcode: 'DEMO-SND-02' },
      { name: 'زيت ورد طائفي نقي تولة', category: 'زيوت نقية', cost: 120, price: 250, qty: 15, unit: 'تولة', barcode: 'DEMO-WRD-03' },
      { name: 'عطر فانيلا وباتشولي باريس 80ml', category: 'عطور نسائية', cost: 38, price: 85, qty: 40, unit: 'قطعة', barcode: 'DEMO-VNL-04' },
      { name: 'بخور عود كمبودي فاخر 50g', category: 'بخور ومباخر', cost: 75, price: 160, qty: 18, unit: 'علبة', barcode: 'DEMO-OUD-05' }
    ];

    for (const prod of demoProducts) {
      queries.push({
        sql: `INSERT INTO inventory (name, category, cost, price, qty, unit, barcode, min_qty, is_demo) VALUES (?, ?, ?, ?, ?, ?, ?, 5, 1)`,
        params: [prod.name, prod.category, prod.cost, prod.price, prod.qty, prod.unit, prod.barcode]
      });
    }

    // 3. Demo Debtors
    const demoDebtors = [
      { name: 'أحمد الترهوني', phone: '0912345678', total_debt: 340 },
      { name: 'سالم المصراتي', phone: '0923456789', total_debt: 190 },
      { name: 'محمد السويحلي', phone: '0945678901', total_debt: 520 }
    ];

    for (const d of demoDebtors) {
      queries.push({
        sql: `INSERT INTO debtors (name, phone, total_debt, created_at, is_demo) VALUES (?, ?, ?, ?, 1)`,
        params: [d.name, d.phone, d.total_debt, now.toISOString()]
      });
    }

    // 4. Demo POS Sales across last 5 days
    for (let dayOffset = 4; dayOffset >= 0; dayOffset--) {
      const saleDate = new Date(now);
      saleDate.setDate(saleDate.getDate() - dayOffset);
      saleDate.setHours(11 + dayOffset, 30, 0, 0);

      const total = 180 + (dayOffset * 45);
      const profit = total * 0.42;
      const methods = ['cash', 'card', 'bank_transfer', 'debt'];
      const method = methods[dayOffset % methods.length];

      queries.push({
        sql: `INSERT INTO sales (date, subtotal, discount, total, profit, payment_method, customer_name, type, is_demo) VALUES (?, ?, 0, ?, ?, ?, ?, 'store', 1)`,
        params: [saleDate.toISOString(), total, total, profit, method, `عميل تجريبي #${dayOffset + 1}`]
      });
    }

    // 5. Demo Online Sales
    for (let i = 1; i <= 3; i++) {
      const onlineDate = new Date(now);
      onlineDate.setHours(onlineDate.getHours() - (i * 6));
      const total = 220 * i;
      const profit = total * 0.4;

      queries.push({
        sql: `INSERT INTO sales (date, subtotal, discount, total, profit, payment_method, customer_name, type, is_demo) VALUES (?, ?, 0, ?, ?, 'cash', ?, 'online', 1)`,
        params: [onlineDate.toISOString(), total, total, profit, `طلب أونلاين - طرابلس #${i}`]
      });
    }

    // 6. Demo Purchases
    queries.push({
      sql: `INSERT INTO purchases (id, date, supplier_name, total, items_json, is_demo) VALUES (?, ?, ?, ?, ?, 1)`,
      params: [
        generateId(),
        now.toISOString(),
        'مورد الزيوت السويسرية',
        1450,
        JSON.stringify([
          { name: 'زيت صندل خام 1L', quantity: 2, cost_per_unit: 450, total_cost: 900 },
          { name: 'زجاجات كريستال فاخرة 100ml', quantity: 100, cost_per_unit: 5.5, total_cost: 550 }
        ])
      ]
    });

    await db.transaction(queries);
    return { success: true };
  }

  /**
   * Safely purge only demo records (is_demo = 1) without touching real production data
   */
  static async purgeDemoData() {
    const tables = ['inventory', 'sales', 'sale_items', 'debtors', 'debt_history', 'purchases', 'shift_reports'];
    const queries = [];

    for (const table of tables) {
      try {
        queries.push({
          sql: `DELETE FROM ${table} WHERE is_demo = 1`,
          params: []
        });
      } catch (e) {}
    }

    await db.transaction(queries);
    return { success: true };
  }
}
