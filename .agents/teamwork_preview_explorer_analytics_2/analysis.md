# Advanced Financial Analytics, Profit Charts & Export Engine Analysis (R2)

**Author:** Explorer 2 (Financial Analytics & Export Engine / R2)  
**Date:** 2026-08-27  
**Scope:** `src/modules/Analytics.jsx`, `src/modules/Dashboard.jsx`, SQLite Repositories (`SalesRepository.js`, `PurchasesRepository.js`, `CapitalRepository.js`, `LossesRepository.js`, `WithdrawalsRepository.js`, `DebtorsRepository.js`, `InventoryRepository.js`, `CategoriesRepository.js`), `main.cjs` IPC handlers, Recharts configurations, and PDF/CSV Export Engine.

---

## 1. Executive Summary

This investigation provides a comprehensive architectural and mathematical audit of the financial analytics, profit modeling, chart visualizations, and data export systems in the Aldaffa Perfumes ERP (الدفة للعطور) desktop application.

### Key Discoveries:
1. **Analytics vs Dashboard Split:**
   - `Dashboard.jsx` (1,113 lines) implements optimized database-level queries (`getSalesSummary`, `getTopSellingProducts`, `getSalesInRange`) with period comparisons, skeleton loading, and CSV export.
   - `Analytics.jsx` (455 lines) currently fetches all records from SQLite via `findAll({}, 'date DESC')` and executes in-memory JS `.filter()` operations. It lacks daily liquidity flow visualization, top products ranking, category distribution charts, custom date picker UI inputs, and functional PDF/CSV export.
2. **Missing Core Visualizations in `Analytics.jsx`:**
   - **Daily Liquidity Flow (Cash In vs Cash Out):** No visual chart or time-series calculation for daily cash inflows vs outflows.
   - **Highest-Profit Products Ranking:** The repository only supports ordering by quantity sold (`ORDER BY total_qty DESC`), not by profit or profit margin.
   - **Category Distribution Breakdown:** No SQL query or visual donut/bar chart for category-level sales/profit distribution.
3. **Date Filtering Bottlenecks:**
   - Date presets in `Analytics.jsx` calculate trailing periods (`now - 30 days`) rather than calendar boundaries (`1st of month to end of month` or `Jan 1 to today for YTD`).
   - The UI contains no input fields for `custom` date selection even though state variables exist.
4. **PDF & CSV Export Engine:**
   - `Analytics.jsx` has a placeholder PDF export (`window.print()` or dummy toast) and no CSV export.
   - `main.cjs` has robust A4 PDF printing infrastructure (`export:shift-pdf`, `print:shift-report`, `print:inventory-report`) using Electron's `webContents.printToPDF` and `dialog.showSaveDialog`, but lacks `export:financial-pdf` and `print:financial-report`.

---

## 2. File & Component Catalog

| File Path | Role | Key Functions / Methods | Current Status |
| :--- | :--- | :--- | :--- |
| `src/modules/Analytics.jsx` | Main Financial Analytics View | `loadData()`, `metrics`, `timeSeriesData`, `paymentBreakdown`, `handleExportPDF()` | Needs major enhancement (liquidity chart, categories, rankings, date picker, real export) |
| `src/modules/Dashboard.jsx` | Operational Overview Dashboard | `fetchDashboardData()`, `exportCSV()`, `loadDashboard()` | Well-structured, contains basic CSV export and top 10 products |
| `src/database/repositories/SalesRepository.js` | Sales SQLite Data Layer | `getSalesInRange()`, `getSalesSummary()`, `getTopSellingProducts()`, `getSalesByPaymentMethod()` | Needs `getMostProfitableProducts()` and `getSalesByCategory()` |
| `src/database/repositories/PurchasesRepository.js` | Purchases SQLite Layer | `getPurchasesInRange()`, `getPurchaseSummary()` | Ready for SQL-level date range queries |
| `src/database/repositories/CapitalRepository.js` | Capital Injections Data Layer | `getInjectionsInRange()`, `getCapitalSummary()`, `getMonthlyTotals()` | Ready for liquidity inflow calculation |
| `src/database/repositories/LossesRepository.js` | Losses / Spoilage Data Layer | `getLossesInRange()`, `getLossesSummary()`, `getMonthlyTotals()` | Ready for operating deduction calculation |
| `src/database/repositories/WithdrawalsRepository.js` | Expenses / Withdrawals Data Layer | `getWithdrawalsInRange()`, `getWithdrawalsSummary()`, `getMonthlyTotals()` | Ready for operating deduction & cash outflow calculation |
| `src/database/repositories/DebtorsRepository.js` | Debtors & Repayments Layer | `getActiveDebtors()`, `getTotalDebt()`, `getDebtAgingReport()` | Active debt tracking & cash recovery |
| `src/database/repositories/InventoryRepository.js` | Products & Cost Valuation Layer | `getTotalValue()`, `getLowStock()`, `getByCategory()` | Stock valuation (WAC) |
| `src/database/repositories/CategoriesRepository.js` | Categories Master Layer | `getCategoriesWithProductCounts()`, `countProductsInCategory()` | Product classification |
| `src/stores/useSettingsStore.js` | System Settings & Store Branding | `getSetting()`, `setSetting()`, `saveMultipleSettings()` | Branding: `store_name`, `store_subtitle`, `logo_base64`, `currency_symbol`, `tax_rate` |
| `main.cjs` | Electron Main Process | IPC handlers for DB, printing, auto-backup, PDF generation | Needs `export:financial-pdf` IPC handler |

---

## 3. Financial Metrics & Mathematical Formulation

### 3.1 Revenue & Gross Profit
$$\text{Total Revenue} = \sum_{s \in \text{Sales}} s.\text{total}$$

$$\text{Cost of Goods Sold (COGS)} = \sum_{i \in \text{Sale Items}} (i.\text{cart\_qty} \times i.\text{unit\_cost})$$

$$\text{Gross Profit} = \sum_{s \in \text{Sales}} s.\text{profit} = \text{Total Revenue} - \text{COGS}$$

$$\text{Gross Profit Margin (\%)} = \left( \frac{\text{Gross Profit}}{\text{Total Revenue}} \right) \times 100$$

### 3.2 Operating Deductions & Net Profit
To calculate the true net profitability of the business across any given period:
$$\text{Total Withdrawals (Expenses)} = \sum_{w \in \text{Withdrawals}} w.\text{amount}$$

$$\text{Total Losses (Spoilage/Damage)} = \sum_{l \in \text{Losses}} l.\text{cost\_value}$$

$$\text{Total Gifts (Promotional/Samples)} = \sum_{g \in \text{Gifts}} g.\text{cost\_value}$$

$$\text{Net Profit} = \text{Gross Profit} - \text{Total Withdrawals} - \text{Total Losses} - \text{Total Gifts}$$

$$\text{Net Margin (\%)} = \left( \frac{\text{Net Profit}}{\text{Total Revenue}} \right) \times 100$$

$$\text{Average Order Value (AOV)} = \frac{\text{Total Revenue}}{\text{Count of Sales}}$$

### 3.3 Liquidity Flow (Cash In vs Cash Out)
Liquidity tracking measures actual physical/electronic cash movements through the business:
$$\text{Cash In} = \text{Cash Sales} + \text{Capital Injections} + \text{Collected Debt Payments}$$
$$\text{Cash Out} = \text{Cash Purchases} + \text{Cash Withdrawals/Expenses}$$
$$\text{Net Liquidity Balance} = \text{Cash In} - \text{Cash Out}$$

---

## 4. Recharts Visualization & Layout Analysis

### 4.1 Required Visual Charts in `Analytics.jsx`

```
+-------------------------------------------------------------------------------+
|                             EXECUTIVE KPI CARDS                               |
| [ Total Revenue ]     [ Gross Profit ]     [ Net Profit ]     [ Net Margin % ] |
| [ Total Purchases ]   [ Cash Inflows ]     [ Cash Outflows ]  [ Avg Order Val ]|
+-------------------------------------------------------------------------------+
| CHART 1: Revenue, Cost & Profit Growth Trend (Area / Composed Chart)          |
| - X-Axis: Date (Daily / Weekly / Monthly intervals)                           |
| - Y-Axis: Currency Value (LYD)                                                |
| - Series: Revenue (Amber), COGS (Rose), Gross Profit (Emerald), Net (Blue)    |
+---------------------------------------+---------------------------------------+
| CHART 2: Daily Liquidity Flow         | CHART 3: Category Distribution        |
| (Composed Bar + Line Chart)           | (Donut / Pie Chart)                   |
| - Bars: Cash In (Green) vs Out (Red)  | - Slices: Perfumes, Oils, Incense...  |
| - Line: Cumulative Net Cash Balance   | - Tooltip: Revenue, Profit & Share %  |
+---------------------------------------+---------------------------------------+
| CHART 4: Payment Methods Distribution | RANKINGS: Top Selling vs Most         |
| (Donut Chart)                         | Profitable Products                   |
| - Cash, Card, Bank Transfer, Debt     | - Dual Tabs: Top Qty / Highest Profit |
+-------------------------------------------------------------------------------+
```

### 4.2 Recharts RTL Best Practices
In React applications configured with `dir="rtl"` (Arabic):
1. **Container Isolation:** Wrap every `<ResponsiveContainer>` in `<div dir="ltr" className="h-72 w-full">` to prevent Recharts coordinate flip bugs on SVG path calculations.
2. **Custom Tooltips:** Tooltips should use `dir="rtl"` inside the tooltip component with styling: `bg-[#0d1117]/95 border border-amber-500/30 rounded-xl p-3 shadow-2xl backdrop-blur-md`.
3. **Axis Formatting:**
   - X-Axis: Date label with Arabic weekday/day formatting.
   - Y-Axis: Numeric formatting via `compactNumber(val)` (`1.2k`, `45k`, `1.5M`).

---

## 5. Top-Selling & Highest-Profit Products Ranking

### 5.1 Current Query in `SalesRepository.js`
```sql
SELECT
  si.product_id,
  si.name,
  SUM(si.cart_qty) as total_qty,
  SUM(si.cart_qty * si.final_price) as total_revenue,
  SUM(si.cart_qty * (si.final_price - si.unit_cost)) as total_profit
FROM sale_items si
JOIN sales s ON si.sale_id = s.id
WHERE s.date >= ? AND s.date <= ?
GROUP BY si.product_id, si.name
ORDER BY total_qty DESC
LIMIT ?
```

### 5.2 Required Extensions in `SalesRepository.js`
1. **Most Profitable Products Ranking:**
   ```sql
   SELECT
     si.product_id,
     si.name,
     SUM(si.cart_qty) as total_qty,
     SUM(si.cart_qty * si.final_price) as total_revenue,
     SUM(si.cart_qty * (si.final_price - si.unit_cost)) as total_profit,
     CASE 
       WHEN SUM(si.cart_qty * si.final_price) > 0 
       THEN (SUM(si.cart_qty * (si.final_price - si.unit_cost)) / SUM(si.cart_qty * si.final_price)) * 100 
       ELSE 0 
     END as profit_margin
   FROM sale_items si
   JOIN sales s ON si.sale_id = s.id
   WHERE s.date >= ? AND s.date <= ?
   GROUP BY si.product_id, si.name
   ORDER BY total_profit DESC
   LIMIT ?
   ```
2. **Category Sales & Profit Breakdown:**
   ```sql
   SELECT
     COALESCE(i.category, 'غير مصنف') as category_name,
     COUNT(DISTINCT s.id) as invoice_count,
     SUM(si.cart_qty) as total_qty,
     SUM(si.cart_qty * si.final_price) as total_revenue,
     SUM(si.cart_qty * (si.final_price - si.unit_cost)) as total_profit
   FROM sale_items si
   JOIN sales s ON si.sale_id = s.id
   LEFT JOIN inventory i ON si.product_id = i.id
   WHERE s.date >= ? AND s.date <= ?
   GROUP BY i.category
   ORDER BY total_revenue DESC
   ```

---

## 6. Date Filtering & Boundary Analysis

### 6.1 Preset Ranges Comparison
| Preset ID | Label | Start Boundary (Local / ISO) | End Boundary (Local / ISO) |
| :--- | :--- | :--- | :--- |
| `today` | اليوم | Today `00:00:00.000` | Today `23:59:59.999` |
| `this_week` | هذا الأسبوع | Current Week Start (Saturday/Monday `00:00:00.000`) | Current Day / Week End `23:59:59.999` |
| `this_month` | هذا الشهر | Day 1 of Month `00:00:00.000` | Last Day of Month `23:59:59.999` |
| `ytd` | منذ بداية السنة | Jan 1 of Current Year `00:00:00.000` | Today `23:59:59.999` |
| `custom` | مخصص | User-selected `startDate + 'T00:00:00.000'` | User-selected `endDate + 'T23:59:59.999'` |

### 6.2 SQL vs In-Memory Execution
- **Current Approach in `Analytics.jsx`:** Calls `findAll()` across 5 tables and filters in JavaScript memory.
- **Recommended Architecture:** Use repository SQL range queries (`getSalesInRange`, `getPurchasesInRange`, `getInjectionsInRange`, `getLossesInRange`, `getWithdrawalsInRange`). This utilizes existing SQLite B-tree indexes (`idx_sales_date`, `idx_purchases_date`, `idx_losses_date`, `idx_withdrawals_date`) initialized in `main.cjs` (lines 260-274).

---

## 7. Export Engine Architecture (PDF & CSV)

### 7.1 Pristine A4 PDF Export Architecture
In Electron Desktop ERP applications, the gold standard for crisp Arabic document rendering is Electron's headless rendering pipeline:

```
[ Frontend: Analytics.jsx ]
       │
       ▼ (reportData + storeSettings)
[ IPC: electron.ipcRenderer.invoke('export:financial-pdf', payload) ]
       │
       ▼
[ Electron Main Process: main.cjs ]
       │
       ├─► 1. generateFinancialReportHtml(payload, settings)
       │      - Embedded Arabic CSS (Tajawal / Cairo / Amiri / system fallback)
       │      - Store Branding (Logo Base64, Store Name, Tax ID, Phone, Address)
       │      - Executive KPI Cards Grid
       │      - Revenue, COGS, Gross & Net Profit Summary Table
       │      - Daily Liquidity & Cash Flow Reconciliation Table
       │      - Payment Methods Distribution
       │      - Category Performance Breakdown
       │      - Top 10 Products by Quantity & Profit
       │      - Operating Expenses & Losses Details
       │
       ├─► 2. dialog.showSaveDialog (Prompt user for save location)
       │
       ├─► 3. Hidden BrowserWindow.loadURL('data:text/html...')
       │
       ├─► 4. webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { top: 0.3, bottom: 0.3, left: 0.3, right: 0.3 } })
       │
       └─► 5. fs.writeFileSync(filePath, pdfBuffer) -> Return { success: true, filePath }
```

### 7.2 Multi-Section CSV Export Architecture
To ensure compatibility with Microsoft Excel in Arabic locale without garbled text:
1. Prepend **UTF-8 Byte Order Mark (BOM)**: `\uFEFF`.
2. Format as a structured multi-table document:
   - **Section 1: Header & Metadata** (Store Name, Report Period, Generation Timestamp).
   - **Section 2: Executive Summary** (Revenue, COGS, Gross Profit, Gross Margin, Net Profit, Net Margin, Cash In, Cash Out, Net Liquidity).
   - **Section 3: Daily Financial & Liquidity Breakdown** (Date, Invoices, Revenue, COGS, Gross Profit, Cash In, Cash Out, Net Cash).
   - **Section 4: Category Distribution** (Category, Invoices, Quantity Sold, Total Revenue, Gross Profit, Margin %).
   - **Section 5: Top Products Ranking** (Rank, Name, Quantity Sold, Revenue, Profit, Margin %).
   - **Section 6: Payment Methods** (Method, Count, Total Amount, Share %).
   - **Section 7: Expenses & Losses** (Type, Date, Details/Recipient, Amount).

---

## 8. Concrete Implementation Blueprint

### Step 1: Extend SQLite Repositories
Add to `SalesRepository.js`:
- `getMostProfitableProducts(limit, startDate, endDate)`
- `getSalesByCategory(startDate, endDate)`
- `getDailyFinancialTrend(startDate, endDate)`

### Step 2: Implement IPC Handlers in `main.cjs`
- Add `generateFinancialReportHtml(reportData, settings)`
- Register `ipcMain.handle('export:financial-pdf', async (event, payload) => { ... })`
- Register `ipcMain.handle('print:financial-report', async (event, payload) => { ... })`

### Step 3: Upgrade `src/modules/Analytics.jsx`
- Replace in-memory queries with SQL range queries.
- Add complete date range selector (`today`, `this_week`, `this_month`, `ytd`, `custom`) with interactive DatePicker inputs.
- Add 8 Executive KPI cards with double-bezel styling.
- Implement 4 interactive Recharts visual components:
  1. Revenue, Cost & Profit Growth Area Chart
  2. Daily Liquidity Flow (Cash In vs Cash Out) Composed Bar/Line Chart
  3. Category Sales & Profit Breakdown Donut Chart
  4. Payment Methods Distribution Donut Chart
- Add Top Selling vs Highest-Profit Products ranking tables with tabs.
- Wire One-Click PDF Export (calling IPC) and One-Click CSV Export (with UTF-8 BOM).

---

## 9. Conclusion
The current codebase has solid foundational building blocks (indexed SQLite schema, base repositories, Recharts, and headless print-to-PDF patterns in `ShiftClose`). By addressing the identified gaps in query optimization, liquidity modeling, category aggregation, and export handlers, the Aldaffa ERP will deliver an enterprise-grade financial analytics suite.
