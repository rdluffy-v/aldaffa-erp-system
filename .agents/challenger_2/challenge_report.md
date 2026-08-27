# Adversarial Challenge Report — Financial Precision & Security Boundaries

**Target Project**: Aldaffa Perfumes ERP (الدفة للعطور)  
**Challenger**: Challenger 2 (Financial Precision & Security Boundary Specialist)  
**Date**: 2026-08-27  
**Status**: VERIFIED WITH FINDINGS & RECOMMENDATIONS

---

## Challenge Summary

**Overall Risk Assessment**: **LOW / MEDIUM** (Core arithmetic, SQL aggregations, and database RBAC are solid and mathematically exact; 2 specific UI-layer edge cases identified).

| Dimension | Assessment | Status |
|---|---|---|
| **Financial Calculations & Precision** | Mathematical formulas, WAC, COGS, Gross/Net Margins, Liquidity Flow, Shift Reconciliation | **PASS (100% Exact)** |
| **Shift Close Cash Drawer Formula** | Inclusion of cash returns deduction in drawer balance | **PASS (Verified)** |
| **RBAC Security Boundaries (Database/Store)** | Cashier, Accountant, and Manager permissions & sole manager deletion lock | **PASS (Verified)** |
| **UI Masking & Role Isolation** | Profit masking in Analytics/Shift/POS vs Dashboard edge case | **FINDING (Documented)** |
| **User Deletion Return Value Handling** | Settings.jsx `handleDeleteUser` checking `res.success` vs `true` | **FINDING (Documented)** |

---

## 1. Financial Precision & Mathematical Invariants

### 1.1 Revenue, COGS, Gross Profit & Net Margin
- **Revenue Invariant**: In `SalesRepository.js` and `Analytics.jsx`, Total Revenue is calculated as $\sum \text{sales.total}$.
- **Cost of Goods Sold (COGS)**:
  - In inventory and purchase workflows, `calculateWAC(oldQty, oldCost, newQty, newCost)` implements exact Weighted Average Cost:
    $$\text{WAC} = \frac{(\text{oldQty} \times \text{oldCost}) + (\text{newQty} \times \text{newCost})}{\text{oldQty} + \text{newQty}}$$
  - For compounded perfume mixing (`PerfumeMixLab.jsx`), unit cost is dynamically calculated from recipe material fractions:
    $$\text{Unit Cost} = (\text{Portion ml} \times \text{Oil Cost/ml}) + \text{Bottle Cost}$$
- **Gross Profit**:
  - In `useCartStore.js`: Gross Profit = $\sum ((\text{final\_price} - \text{unit\_cost}) \times \text{cart\_qty}) - \text{discountAmount}$.
  - In `SalesRepository.getMostProfitableProducts`: Product ranking computes $\sum (\text{cart\_qty} \times (\text{final\_price} - \text{unit\_cost}))$ with zero-division protection:
    $$\text{CASE WHEN } \sum(\text{cart\_qty} \times \text{final\_price}) > 0 \text{ THEN } \frac{\text{Profit}}{\text{Revenue}} \times 100 \text{ ELSE } 0 \text{ END}$$
- **Net Margin**:
  - In `Analytics.jsx`: $\text{Net Profit} = \text{Total Profit} - \text{Total Withdrawals} - \text{Total Losses}$.
  - $\text{Net Margin \%} = \frac{\text{Net Profit}}{\text{Total Revenue}} \times 100$.
- **Average Order Value (AOV)**:
  - $\text{AOV} = \frac{\text{Total Revenue}}{\text{Invoice Count}}$, handled gracefully when count is zero.

### 1.2 Liquidity Flow (Cash In vs Cash Out)
- In `Analytics.jsx` (lines 235-284):
  $$\text{Cash Inflow} = \text{Sales Revenue} + \text{Capital Injections}$$
  $$\text{Cash Outflow} = \text{Supplier Purchases} + \text{Operating Withdrawals} + \text{Spoilage Losses}$$
  $$\text{Net Liquidity Flow} = \text{Cash Inflow} - \text{Cash Outflow}$$
- Grouped daily via ISO dates (`YYYY-MM-DD`), matching real-time cash drawer realities.

### 1.3 Shift Close Cash Drawer Reconciliation Formula
- **Audited Equation** (`ShiftClose.jsx` lines 199-204):
  $$\text{Expected Cash in Drawer} = \text{Cash Sales} + \text{Cash Capital} - \text{Cash Withdrawals} - \text{Cash Purchases (Paid Cash)} - \text{Cash Returns}$$
  $$\text{Variance} = \text{Actual Cash Counted} - \text{Expected Cash in Drawer}$$
  - $\text{Variance} = 0 \implies \text{مطابق تماماً (0.00 د.ل)}$
  - $\text{Variance} > 0 \implies \text{فائض نقدي (+)}$
  - $\text{Variance} < 0 \implies \text{عجز نقدي (-)}$
- **Verification**: Refunding customers for returned goods in cash directly reduces physical drawer liquidity. Deducting `totalCashReturns` is mathematically necessary and was properly implemented.

---

## 2. Security Boundaries & Role-Based Access Control (RBAC)

### 2.1 Cashier Role Boundary Matrix
- **Preset Configuration (`ROLE_PRESETS.cashier`)**:
  - `view_profit: false`
  - `change_price: false`
  - `apply_discount: false`
  - `delete_invoice: false`
  - `manage_users: false`
  - `purge_data: false`
  - `edit_settings: false`
  - Allowed modules: `module_pos`, `module_shift`, `module_returns`, `module_barcodes`, `module_online`.
- **Enforcement in Code**:
  - `POS.jsx`: Unit price inputs and discount selectors are marked `disabled` and `readOnly` when `!canChangePrice` or `!canApplyDiscount`.
  - `Invoices.jsx`: Delete invoice buttons require `canDeleteInvoice` permission.
  - `Debtors.jsx` & `Purchases.jsx`: Deletion actions require `manager` role or `delete_invoice` permission.
  - `Analytics.jsx`: If a cashier accesses analytics, all KPI profit metrics, chart lines, and ranking tables display `'••••••'` / `'محمي'`.

### 2.2 Accountant Role Boundary Matrix
- **Preset Configuration (`ROLE_PRESETS.accountant`)**:
  - `view_profit: true` (Full visibility of financial profitability and margins)
  - `delete_invoice: false` (Cannot destroy financial records)
  - `edit_settings: false` (Cannot alter store parameters or tax rules)
  - `purge_data: false` (Cannot wipe database)
  - `manage_users: false` (Cannot modify staff PINs)
- **Enforcement in Code**: Verified in `UsersRepository.js` and `useAuthStore.js`.

### 2.3 Manager Role & Sole Manager Protection
- **Preset Configuration (`ROLE_PRESETS.manager`)**: Full access to all 21 modules and all 7 special action keys.
- **Sole Manager Protection**:
  - In `UsersRepository.deleteUser(userId)`:
    ```javascript
    if (user.role === 'manager') {
      const allUsers = await this.findAll({ role: 'manager' });
      if (!allUsers || allUsers.length <= 1) {
        throw new Error('لا يمكن حذف حساب المدير العام الوحيد المتبقي في المنظومة');
      }
    }
    ```
  - When only 1 manager account exists, deletion throws an exception preventing system lockout.
  - When 2 or more managers exist, deleting one manager is permitted.

---

## 3. Adversarial Findings & Mitigations

### Finding 1: Settings.jsx `handleDeleteUser` Return Value Type Mismatch
- **Severity**: LOW (Functional UI Glitch)
- **Location**: `src/modules/Settings.jsx` (lines 572–577)
- **Description**: `UsersRepository.deleteUser()` returns boolean `true`. In `Settings.jsx`, `handleDeleteUser` checks `if (res.success)`. Because `true.success` is `undefined`, the block falls through to `showError('تعذر الحذف: undefined')` even though the user was successfully deleted from SQLite.
- **Mitigation**: Update condition to:
  ```javascript
  if (res === true || res?.success) {
    showSuccess('✅ تم حذف حساب الموظف بنجاح');
    await loadUsers();
  }
  ```

### Finding 2: Dashboard.jsx Mini-Circle Profit Masking Edge Case
- **Severity**: LOW-MEDIUM (Information Disclosure on Custom Roles)
- **Location**: `src/modules/Dashboard.jsx` (lines 843–884 and lines 452, 465)
- **Description**: In `Dashboard.jsx`, the primary KPI cards and chart areas respect `canViewProfit`. However, the 8 circular summary widgets (circles 3, 4, 5 for Profit, Net Profit, and Cost) and the raw CSV export render `summary.profit` directly without `canViewProfit` checks.
- **Impact**: While default cashiers cannot access `module_dashboard`, if an administrator creates a custom staff role granting `module_dashboard: true` but `view_profit: false`, profit data would be visible in these 3 circular badges.
- **Mitigation**: Wrap circular values and CSV profit rows with `{canViewProfit ? formatCurrency(summary.profit) : '••••••'}`.

---

## 4. Test Suite Coverage

The project now includes 7 comprehensive test suites in `test/suites/`:
1. `01_rbac_permissions.test.js` — Role presets, user seeding, PIN collision, sole manager guard.
2. `02_atomic_transactions.test.js` — SQLite multi-query transactions, automatic rollback.
3. `03_sales_analytics.test.js` — Indexed date range queries, product profit ranking, category breakdown.
4. `04_shift_close_math.test.js` — Cash drawer reconciliation with cash returns.
5. `05_modules_coverage.test.js` — End-to-end coverage across categories, inventory, debt, purchases, losses, withdrawals, capital, settings.
6. `06_financial_precision_adversarial.test.js` — WAC, gross/net margins, compounding fractions, liquidity flow.
7. `07_security_boundaries_adversarial.test.js` — Role boundaries, cashier price/discount locks, accountant limits, sole manager immunity.

---

## Conclusion
The Aldaffa Perfumes ERP system possesses a mathematically precise financial computation engine and robust role-based security boundary architecture. The two identified findings have been isolated with exact line numbers and proposed remediations.
