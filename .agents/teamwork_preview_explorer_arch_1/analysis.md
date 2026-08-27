# Comprehensive System Architecture, SQLite Schema & RBAC Analysis (R1)
**Project**: Aldaffa Perfumes ERP (الدفة للعطور)
**Target**: Desktop ERP Architecture, SQLite Schema, RBAC, PIN Authentication & 20-Module Permission Guards
**Date**: 2026-08-27
**Author**: Explorer 1 (System Architecture & RBAC)

---

## 1. Executive Summary

Aldaffa Perfumes ERP is an offline-first desktop ERP application built on **Electron 43 + React 19 + SQLite (better-sqlite3) + Zustand**. 

Our deep investigation across `main.cjs`, `src/database/connection.js`, `UsersRepository.js`, `useAuthStore.js`, `App.jsx`, and all 20 ERP modules reveals:
1. **Schema & IPC Foundation**: The SQLite database and IPC bridge already contain `users` and `user_permissions` tables and default manager seeding, but the system is currently running in an **open/unguarded state** where every user default-logs in as `admin_1` (المدير العام) without authentication enforcement.
2. **Auth Disconnection**: `useAuthStore.js` exists but is **zero percent integrated** into `App.jsx`, `Header.jsx`, `Navigation.jsx`, `Settings.jsx`, or any of the 20 feature modules.
3. **Missing Permission Gates**: Critical financial figures (profit margins, product cost prices, gross profits) and destructive actions (invoice deletion, debt erasure, purchase deletion, database shrinkage, sandbox purging) are exposed and accessible without role checks.
4. **Missing UI Screens**: `Settings.jsx` lacks a dedicated "المستخدمين والصلاحيات" (Users & Permissions) management tab to add/edit staff, set 4-digit PINs, select roles, and toggle granular permissions.
5. **No Lock Screen / Fast User Switching**: The application lacks an on-launch PIN lock screen and header-based quick user switching for cashiers changing shifts.

---

## 2. Electron Architecture & IPC Data Flow

### 2.1 Core Infrastructure
```
┌──────────────────────────────────────────────────────────────────┐
│                   React 19 Presentation Layer                    │
│   (20 Modules + Header + Navigation + Zustand useAuthStore)       │
└────────────────────────────────┬─────────────────────────────────┘
                                 │ Component Actions / Hooks
┌────────────────────────────────▼─────────────────────────────────┐
│                    Zustand Stores Layer                          │
│   useAuthStore, useInventoryStore, useCartStore, useSettingsStore │
└────────────────────────────────┬─────────────────────────────────┘
                                 │ Repository Invocations
┌────────────────────────────────▼─────────────────────────────────┐
│               Data Access Layer (Repositories)                   │
│   UsersRepository, SalesRepository, InventoryRepository, etc.     │
└────────────────────────────────┬─────────────────────────────────┘
                                 │ db.query / db.run / db.get
┌────────────────────────────────▼─────────────────────────────────┐
│           IPC Bridge Layer (src/database/connection.js)          │
│   - 5s SELECT query cache with regex pattern invalidation        │
│   - 3x retry mechanism with backoff                              │
│   - Multi-statement SQLite transaction wrapper                   │
└────────────────────────────────┬─────────────────────────────────┘
                                 │ window.require('electron').ipcRenderer
┌────────────────────────────────▼─────────────────────────────────┐
│             Electron Main Process (main.cjs)                     │
│   - better-sqlite3 with WAL journal mode (aldaffa_erp.db)        │
│   - IPC handlers: db:query, db:run, db:get, print:*, archive:*   │
│   - Automatic WAL flush on quit and daily snapshot autobackups   │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 IPC Handlers & Transaction Reliability
- **`main.cjs` (lines 655–688)**: Exposes `db:query`, `db:run`, and `db:get` handlers interfacing `better-sqlite3` statements synchronously in the main process, returning `{ success: true, data }` or `{ success: false, error }`.
- **`src/database/connection.js` (lines 8–146)**: Provides transaction isolation via `db.transaction(queries)` which issues `BEGIN TRANSACTION` → sequential `ipcRenderer.invoke('db:run')` → `COMMIT` / `ROLLBACK`.
- **IPC Safety**: `main.cjs` has crash-safe thermal printing, A4 print generation, and safe cache purging (`purgeSafeCaches()` lines 389–412) that never touches the database.

---

## 3. SQLite Database Schema & RBAC State

### 3.1 Existing Tables in `main.cjs`
Located at `main.cjs:178-192`:
```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pin TEXT NOT NULL,
  role TEXT DEFAULT 'cashier',
  avatar TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  is_allowed INTEGER DEFAULT 1,
  PRIMARY KEY(user_id, permission_key)
);
```

### 3.2 Seeding State
Located at `main.cjs:276-288`:
```javascript
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
if (!userCount || userCount.count === 0) {
  db.prepare(`
    INSERT INTO users (id, name, pin, role, created_at)
    VALUES ('admin_1', 'المدير العام', '1234', 'manager', datetime('now'))
  `).run();
  console.log('Default Manager user created (PIN: 1234)');
}
```

### 3.3 Enhanced Default Seeding Recommendation
To support the 3 primary roles out-of-the-box in development and production:
1. **المدير العام (Manager)**: ID `admin_1`, PIN `1234`, Role `manager`
2. **المحاسب (Accountant)**: ID `usr_accountant`, PIN `5678`, Role `accountant`
3. **الكاشير المناوب (Cashier)**: ID `usr_cashier`, PIN `0000`, Role `cashier`

---

## 4. Current State vs Required State: Auth & Users Repository

### 4.1 `UsersRepository.js` Inspection
Located at `src/database/repositories/UsersRepository.js`:
- `authenticatePin(pin)`: Queries `SELECT * FROM users WHERE pin = ? LIMIT 1` and attaches `permissions` map from `user_permissions`.
- `getAllUsersWithPermissions()`: Retrieves all users with nested permission maps.
- `setUserPermissions(userId, permissionsMap)`: Uses `INSERT ... ON CONFLICT(user_id, permission_key) DO UPDATE SET is_allowed = excluded.is_allowed`.
- `saveUser(userData, permissionsMap)`: Inserts or updates user records with UUIDs `usr_${timestamp}`.
- `deleteUser(userId)`: Deletes user and associated rows from `user_permissions`.

**Required Repository Enhancements**:
1. Add PIN uniqueness check before saving (`checkPinAvailability(pin, excludeUserId)`).
2. Protect the root manager account (`admin_1`) or ensure at least one manager exists at all times (prevent deleting the only manager).
3. Provide default permission templates per role.

### 4.2 `useAuthStore.js` Inspection & Gaps
Located at `src/stores/useAuthStore.js`:
- Current `currentUser` is hardcoded to `DEFAULT_MANAGER` and never synced with SQLite on launch.
- Missing lock screen state (`isLocked: true/false`).
- Missing complete list of permission keys for all 20 modules and special actions.
- Missing role-based fallback hierarchy when explicit permissions are not populated in `user_permissions`.

---

## 5. Complete RBAC & Permissions Matrix

### 5.1 Role Hierarchy & Default Permissions

| Permission Key | Description / Action | Manager (المدير العام) | Accountant (المحاسب) | Cashier (الكاشير المناوب) |
|---|---|:---:|:---:|:---:|
| **`module_dashboard`** | لوحة المؤشرات والرسوم البيانية | ✅ Full | ✅ Full | ❌ Blocked |
| **`module_analytics`** | التقارير والتحليلات المالية المتقدمة | ✅ Full | ✅ Full | ❌ Blocked |
| **`module_pos`** | نقاط البيع وشاشة الكاشير السريعة | ✅ Full | ✅ Full | ✅ Full |
| **`module_online`** | مبيعات الأونلاين والشحن والتوصيل | ✅ Full | ✅ Full | ✅ Full |
| **`module_returns`** | مركز إدارة المرتجعات | ✅ Full | ✅ Full | ✅ Full |
| **`module_invoices`** | مركز تدقيق وأرشيف الفواتير | ✅ Full | ✅ Full | ❌ Blocked (or View Only) |
| **`module_debtors`** | ديون العملاء وكشوفات الحساب | ✅ Full | ✅ Full | ❌ Blocked |
| **`module_inventory`** | إدارة المخزون والأصناف والتسعير | ✅ Full | ✅ Full | ❌ Blocked |
| **`module_purchases`** | فواتير المشتريات والتوريدات | ✅ Full | ✅ Full | ❌ Blocked |
| **`module_barcodes`** | استوديو توليد وطباعة الباركود | ✅ Full | ✅ Full | ✅ Full |
| **`module_withdrawals`** | السحوبات النقدية والمصروفات | ✅ Full | ✅ Full | ❌ Blocked |
| **`module_capital`** | الضخ المالي والسيولة | ✅ Full | ✅ Full | ❌ Blocked |
| **`module_gifts`** | الهدايا والعينات الترويجية | ✅ Full | ✅ Full | ❌ Blocked |
| **`module_losses`** | التوالف والفاقد والكسر | ✅ Full | ✅ Full | ❌ Blocked |
| **`module_mixlab`** | مختبر تركيب العطور والخلطات | ✅ Full | ✅ Full | ❌ Blocked |
| **`module_discounts`** | إدارة الخصومات والعروض | ✅ Full | ✅ Full | ❌ Blocked |
| **`module_categories`** | إدارة وتخصيص التصنيفات | ✅ Full | ✅ Full | ❌ Blocked |
| **`module_notes`** | الملاحظات والتوثيق | ✅ Full | ✅ Full | ❌ Blocked |
| **`module_advisor`** | المستشار الذكي (AI Advisor) | ✅ Full | ✅ Full | ❌ Blocked |
| **`module_shift`** | إغلاق الوردية وتسوية الخزينة | ✅ Full | ✅ Full | ✅ Full |
| **`module_settings`** | لوحة الإعدادات وتخصيص النظام | ✅ Full | ❌ Blocked | ❌ Blocked |
| **Special Action Permissions** | | | | |
| **`view_profit`** | رؤية أسعار التكلفة وصافي الأرباح والهوامش | ✅ Allowed | ✅ Allowed | ❌ Masked / Hidden |
| **`delete_invoice`** | حذف فواتير المبيعات، المشتريات والديون | ✅ Allowed | ❌ Blocked | ❌ Blocked |
| **`manage_users`** | إضافة وتعديل وحذف الموظفين والصلاحيات | ✅ Allowed | ❌ Blocked | ❌ Blocked |
| **`purge_data`** | ترحيل البيانات، تنظيف SQLite، تطهير التجربة | ✅ Allowed | ❌ Blocked | ❌ Blocked |
| **`change_price`** | تعديل أسعار البيع المباشرة في السلة (POS) | ✅ Allowed | ❌ Blocked | ❌ Blocked |
| **`apply_discount`** | تطبيق خصم يدوي مخصص على الفواتير | ✅ Allowed | ✅ Allowed | ❌ Blocked |

---

## 6. Audit of All 20 ERP Modules: Missing Permission Gates

### 6.1 `App.jsx` & Navigation Canopy
- **Current Issue**: `App.jsx` (lines 73–95) and `Navigation.jsx` (lines 19–67) render all 21 module tabs unconditionally. A Cashier sees all tabs and can click into Settings, Financial Analytics, Capital Injections, Losses, etc.
- **Required Gate**:
  * Filter `modules` in `App.jsx` using `useAuthStore.getState().canAccessModule(mod.id)`.
  * If the active module is disallowed (e.g. following a fast user switch), automatically redirect to `'pos'`.
  * Display a dedicated `PermissionGuard` fallback screen if a blocked module is rendered directly.

### 6.2 `Header.jsx`
- **Current Issue**: Header does not show the active staff user, lacks a quick user switch / lock button, and exposes the "تطهير وإيقاف" sandbox purge button (lines 95–102) to all users.
- **Required Gate**:
  * Add a User Switcher Chip: `👤 [اسم المستخدم] • [الرتبة]` with PIN prompt on click.
  * Add a Lock Screen Button (🔒 قفل الشاشة).
  * Guard the "تطهير وإيقاف" sandbox purge button with `hasPermission('purge_data')`.

### 6.3 `POS.jsx`
- **Current Issues**:
  * Any user can overwrite the product unit price in the cart (lines 504–508) via `<input type="number" value={item.final_price} .../>`.
  * Any user can toggle % / د.ل discount and enter arbitrary discount amounts (lines 547–581).
- **Required Gate**:
  * Guard price modification with `hasPermission('change_price')`. If false, render the price as read-only.
  * Guard discount modification with `hasPermission('apply_discount')`. If false, disable or hide discount controls.
  * Pass `currentUser.name` into the sale record and receipt template as the cashier.

### 6.4 `Invoices.jsx`
- **Current Issues**:
  * Any user can click `<Trash2>` in the invoice table (lines 349–355) and in the preview modal (lines 441–447) to permanently delete POS sales, online orders, or purchase orders.
- **Required Gate**:
  * Guard delete buttons with `hasPermission('delete_invoice')`. If false, hide the trash action column/buttons.

### 6.5 `InventoryFull.jsx`
- **Current Issues**:
  * Stats card (lines 476–483) displays `قيمة المخزون (تكلفة)` (Total Cost Value).
  * Product card (lines 631–635) displays `التكلفة: formatCurrency(product.cost)`.
  * Product add/edit form (lines 266–268) displays cost input.
  * Delete product button (lines 687–694) is unguarded.
- **Required Gate**:
  * Guard cost displays with `hasPermission('view_profit')`. If false, mask cost as `*** د.ل` or hide the stat card.
  * Guard product deletion with `hasPermission('delete_invoice')` or manager role.

### 6.6 `ShiftClose.jsx`
- **Current Issues**:
  * KPI banner (lines 464–473) and sales breakdown table (line 671) display `صافي الأرباح المحققة` (Net Profit).
  * Delete past shift report button (lines 968–975) is unguarded.
- **Required Gate**:
  * Mask or hide profit metrics if `hasPermission('view_profit')` is false.
  * Guard past shift report deletion with manager role.

### 6.7 `Analytics.jsx` & `Dashboard.jsx`
- **Current Issues**:
  * Both modules expose gross profit, net profit margins, cost breakdowns, and profit trend charts.
- **Required Gate**:
  * Disallow module access completely for Cashiers (`canAccessModule('analytics')`, `canAccessModule('dashboard')`).
  * In `Dashboard.jsx`, if `view_profit` is false, hide the profit KPI card, hide profit series in Area charts, and omit the profit column in Top Products table.

### 6.8 `Debtors.jsx` & `Purchases.jsx`
- **Current Issues**:
  * `Debtors.jsx` lines 197–221 allow anyone to delete debtor accounts and erase debt history.
  * `Purchases.jsx` lines 205–219 allow anyone to delete purchase orders.
- **Required Gate**:
  * Guard deletion with `hasPermission('delete_invoice')` or manager role.

### 6.9 `Settings.jsx`
- **Current Issues**:
  * Entire module is open to all users.
  * Archive and cache purging features (lines 683–796) can be run by anyone.
  * Lacks a "المستخدمين والصلاحيات" (Users & Permissions) tab.
- **Required Gate**:
  * Block `settings` module for non-managers (`canAccessModule('settings')`).
  * Add the 6th tab: `{ id: 'users', label: 'المستخدمين والصلاحيات', icon: Users }`.

---

## 7. Implementation Blueprint for Users & Permissions in Settings

### 7.1 Settings Tab Structure
The `TABS` array in `Settings.jsx` should be expanded:
```javascript
const TABS = [
  { id: 'guide', label: '📘 كيف تعمل المنظومة؟ (دليل دورة الحياة)', icon: BookOpen },
  { id: 'users', label: 'المستخدمين والصلاحيات', icon: ShieldCheck }, // <-- NEW
  { id: 'print', label: 'استوديو وقوالب الطباعة', icon: Printer },
  { id: 'labels', label: 'التعديل الحر للمسميات', icon: Type },
  { id: 'archive', label: 'الترحيل وصيانة المنظومة', icon: Database },
  { id: 'ai_updates', label: 'المستشار الذكي والتحديثات', icon: Sparkles }
];
```

### 7.2 Users Management UI Features
1. **Users List Table**:
   - Columns: User Avatar/Icon, Staff Name, Role Badge (المدير العام / المحاسب / الكاشير المناوب), PIN Status (4-digit masked), Created Date, Active Permissions Count, Actions (Edit, Reset PIN, Delete).
   - "➕ إضافة موظف جديد" (Add New Staff) button.
2. **Add / Edit User Modal**:
   - Name input (اسم الموظف).
   - PIN code input (رمز الدخول السري - 4 أرقام).
   - Role dropdown selector (المدير العام / المحاسب / الكاشير المناوب).
   - "تطبيق الصلاحيات الافتراضية للرتبة" (Apply Preset) button that automatically populates permissions.
   - **Granular Permissions Matrix**:
     * **الأقسام المصرح بها (20 Modules)**: Grid of switch toggles for each module.
     * **العمليات الحساسة والإدارية (6 Special Actions)**: Switch toggles for `view_profit`, `delete_invoice`, `manage_users`, `purge_data`, `change_price`, `apply_discount`.
3. **Safety Constraints**:
   - Prevent deletion of the logged-in user.
   - Prevent deletion of the last remaining Manager account.
   - Validate that PIN is exactly 4 numeric digits and unique across active users.

---

## 8. Authentication Gate & Lock Screen Specification

### 8.1 On-Launch Lock Screen
- When `useAuthStore` initializes, if `isAuthenticated === false` or `isLocked === true`, render an elegant glassmorphism Lock Screen overlay over `App.jsx`.
- The user can select their staff account from an avatar grid or enter their 4-digit PIN on a numeric keypad / keyboard.
- On valid PIN verification, store sets `currentUser`, sets `isAuthenticated = true`, `isLocked = false`, and unlocks the ERP interface.

### 8.2 Header Fast Switcher
- In `Header.jsx`, render:
  ```jsx
  <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-full cursor-pointer hover:bg-amber-500/20 transition-all">
    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
    <span className="text-xs font-bold text-amber-900 dark:text-amber-300">{currentUser.name}</span>
    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400 font-semibold">
      {currentUser.role === 'manager' ? 'المدير العام' : currentUser.role === 'accountant' ? 'المحاسب' : 'الكاشير المناوب'}
    </span>
    <button onClick={openSwitchUserModal} title="تبديل المستخدم أو قفل الشاشة" className="text-gray-400 hover:text-amber-500">
      <Lock className="w-3.5 h-3.5" />
    </button>
  </div>
  ```

---

## 9. Conclusion

The system architecture and SQLite data access layer are well-structured, but RBAC enforcement must be woven through `useAuthStore`, `App.jsx`, `Navigation.jsx`, `Header.jsx`, `Settings.jsx`, and the specific ERP module guards (`POS.jsx`, `Invoices.jsx`, `InventoryFull.jsx`, `ShiftClose.jsx`, `Analytics.jsx`, `Dashboard.jsx`). 

Detailed implementation tasks and code change recipes are specified in `handoff.md`.
