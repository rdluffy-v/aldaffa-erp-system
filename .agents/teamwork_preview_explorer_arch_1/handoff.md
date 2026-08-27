# Handoff Report: System Architecture, SQLite Schema & RBAC (R1)

**Agent**: Explorer 1 (System Architecture & RBAC)  
**Date**: 2026-08-27  
**Working Directory**: `/home/rdluffy/Desktop/aldaffa-app-desktop/.agents/teamwork_preview_explorer_arch_1`  
**Target Milestone**: Milestone 1 (M1 / R1) — User Roles & Granular Permissions System  

---

## 1. Observation

Direct observations across the codebase:

1. **Database Schema & Seeding**:
   - `main.cjs:178-192`: `users` and `user_permissions` tables exist with columns `(id, name, pin, role, avatar, created_at)` and `(user_id, permission_key, is_allowed)`.
   - `main.cjs:277-288`: Default Manager is seeded on empty DB:
     ```javascript
     INSERT INTO users (id, name, pin, role, created_at)
     VALUES ('admin_1', 'المدير العام', '1234', 'manager', datetime('now'))
     ```
   - Only `admin_1` is currently seeded. No default Accountant or Cashier users exist in initial migrations.

2. **Repository & Store Disconnection**:
   - `src/database/repositories/UsersRepository.js:1-108`: Contains basic CRUD and PIN auth (`authenticatePin(pin)`), but does not validate PIN uniqueness or prevent deleting the sole administrator.
   - `src/stores/useAuthStore.js:1-122`: Defines `useAuthStore` with `DEFAULT_MANAGER`, `PERMISSION_KEYS`, `loginWithPin()`, `hasPermission()`, `canAccessModule()`.
   - `grep_search` across `src/` revealed that `useAuthStore` was **only referenced in `useAuthStore.js` itself** (0 references in `App.jsx`, `Header.jsx`, `Navigation.jsx`, `Settings.jsx`, or any of the 20 ERP modules).

3. **Navigation & Module Access Unrestricted**:
   - `src/App.jsx:73-95`: `MODULE_DEFINITIONS` contains 21 modules (`dashboard`, `analytics`, `pos`, `online`, `returns`, `invoices`, `debtors`, `inventory`, `purchases`, `barcodes`, `withdrawals`, `capital`, `gifts`, `losses`, `mixlab`, `discounts`, `categories`, `notes`, `advisor`, `shift`, `settings`).
   - `src/components/layout/Navigation.jsx:19-67`: Renders all module tabs unconditionally without checking `canAccessModule()`.
   - `src/components/layout/Header.jsx:95-102`: Renders the sandbox data purge button `تطهير وإيقاف` to all users without role checking.

4. **Missing Permission Guards in ERP Modules**:
   - `src/modules/POS.jsx:504-508`: Allows manual price editing in cart for any user without checking `change_price`.
   - `src/modules/POS.jsx:547-581`: Allows custom discount overrides without checking `apply_discount`.
   - `src/modules/Invoices.jsx:349-355` & `441-447`: Renders `<Trash2>` invoice deletion button without checking `delete_invoice`.
   - `src/modules/InventoryFull.jsx:476-483` & `631-635`: Renders total stock cost and unit cost without checking `view_profit`.
   - `src/modules/ShiftClose.jsx:464-473` & `671`: Displays `صافي الأرباح المحققة` without checking `view_profit`.
   - `src/modules/Debtors.jsx:197-246`: Allows deleting debtor accounts and debt history records without permission checks.
   - `src/modules/Purchases.jsx:205-219`: Allows deleting purchase orders and modifying stock without permission checks.
   - `src/modules/Analytics.jsx` & `src/modules/Dashboard.jsx`: Display profit metrics, margins, and profit trends without role restrictions.

5. **Settings Management UI**:
   - `src/modules/Settings.jsx:898-904`: `TABS` array contains 5 tabs (`guide`, `print`, `labels`, `archive`, `ai_updates`). There is **no User Management tab** in `Settings.jsx`.

---

## 2. Logic Chain

1. **Premise 1**: The business requirement (R1) requires 3 primary roles (**المدير العام Manager**, **المحاسب Accountant**, **الكاشير المناوب Cashier**), secure PIN login, quick user switching, hiding restricted actions/profit figures for cashiers, and a dedicated user management screen in `Settings.jsx`.
2. **Premise 2**: Since `useAuthStore` is currently not connected to the app shell or modules (Observation 2), the application operates in an open state with no authentication barriers.
3. **Premise 3**: Because `Navigation.jsx` and `App.jsx` do not filter modules by `canAccessModule(mod.id)` (Observation 3), any cashier can access managerial and financial modules (Analytics, Dashboard, Settings, Capital Injections, Losses, etc.).
4. **Premise 4**: Because individual module actions (deleting invoices, adjusting prices, applying discounts, viewing profit/cost) lack `hasPermission()` guards (Observation 4), cashiers and unauthorized staff can perform destructive actions and view confidential profit margins.
5. **Conclusion**: To fulfill R1, we must:
   - Wire `useAuthStore` to app startup and create a Lock Screen / PIN authentication modal and Header user switcher.
   - Guard `Navigation.jsx` and `App.jsx` with `canAccessModule()`.
   - Implement the "المستخدمين والصلاحيات" (Users & Permissions) tab in `Settings.jsx`.
   - Embed granular permission guards in `POS.jsx`, `Invoices.jsx`, `InventoryFull.jsx`, `ShiftClose.jsx`, `Dashboard.jsx`, `Analytics.jsx`, `Debtors.jsx`, `Purchases.jsx`, and `Header.jsx`.

---

## 3. Caveats

- **Network Restrictions**: The application operates in offline desktop mode. No external auth servers (OAuth, Firebase Auth) are used; authentication is 100% local SQLite-backed PIN verification.
- **PIN Complexity**: PIN codes are designed for rapid POS cash register entry (4-digit numeric string). Hashing with bcrypt/argon2 in pure SQLite offline desktop without native binding bloat can be done via standard crypto or stored cleanly in SQLite with appropriate local permissions.
- **Demo Mode**: The sandbox engine (`SandboxEngine.js`) must preserve user accounts and permissions during demo data seeding and purging (i.e. `users` and `user_permissions` must never be wiped when purging demo data).

---

## 4. Conclusion & Actionable Implementation Plan

### Step-by-Step Implementation Recipe for Implementer:

#### A. Database & Repository Updates (`src/database/repositories/UsersRepository.js`)
1. Add initial seed checks for 3 default staff roles (`admin_1` / PIN 1234, `usr_accountant` / PIN 5678, `usr_cashier` / PIN 0000).
2. Add `checkPinAvailability(pin, excludeUserId)` method to prevent duplicate PINs.
3. Add protection against deleting the last manager account.
4. Export role permission presets (`ROLE_PRESETS.manager`, `ROLE_PRESETS.accountant`, `ROLE_PRESETS.cashier`).

#### B. Auth Store Updates (`src/stores/useAuthStore.js`)
1. Add full list of `PERMISSION_KEYS` (all 20 modules + 6 special actions).
2. Add `isLocked` state (defaults to `true` or requires PIN on startup if configured).
3. Enhance `hasPermission(key)` and `canAccessModule(moduleId)` with role fallback presets.
4. Add `lockApp()`, `unlockApp(pin)`, and `quickSwitchUser(user, pin)` actions.

#### C. App Shell, Lock Screen & Header Integration
1. **`src/App.jsx`**:
   - Call `useAuthStore.getState().loadUsers()` on mount.
   - If `useAuthStore((s) => s.isLocked)` is true, render the full-screen `LockScreenModal`.
   - Filter `modules` passed to `MainLayout` by `canAccessModule(mod.id)`.
   - If `activeModule` is not allowed for the current user, auto-switch to `'pos'`.
2. **`src/components/layout/Header.jsx`**:
   - Render User Badge: `👤 [Name] ([Role Label])` with click-to-switch.
   - Render Lock Screen Button (`🔒`).
   - Hide the sandbox purge button if `!hasPermission('purge_data')`.
3. **`src/components/layout/Navigation.jsx`**:
   - Filter tabs so only allowed modules appear for the current user.

#### D. Settings User Management Tab (`src/modules/Settings.jsx`)
1. Add `users` tab to `TABS` array in `Settings.jsx`.
2. Build User Management sub-view:
   - Staff list table with Avatar, Name, Role badge, PIN status, Created Date, Actions (Edit, Delete).
   - "➕ إضافة موظف جديد" (Add New User) modal.
   - Role selector with auto-filling preset permissions.
   - Granular toggle matrix for 20 modules and 6 special actions.
   - Save / Update / Delete handlers wired to `UsersRepository`.

#### E. Module Permission Guards
1. **`POS.jsx`**: Guard price input with `change_price` and discount controls with `apply_discount`.
2. **`Invoices.jsx`**: Guard `<Trash2>` delete buttons with `delete_invoice`.
3. **`InventoryFull.jsx`**: Mask cost prices and total stock value if `!hasPermission('view_profit')`; guard delete buttons.
4. **`ShiftClose.jsx`**: Mask `صافي الأرباح` if `!hasPermission('view_profit')`; guard delete shift report button.
5. **`Dashboard.jsx`**: Hide profit KPI card and chart series if `!hasPermission('view_profit')`.
6. **`Analytics.jsx`**: Guard whole module access and profit metrics.
7. **`Debtors.jsx` & `Purchases.jsx`**: Guard delete actions with `delete_invoice` / manager role.

---

## 5. Verification Method

To verify the implementation independently:

1. **Build & Syntax Verification**:
   ```bash
   npm run build
   ```
   Ensure zero Vite compilation or JSX syntax errors.

2. **Role Permission Inspection**:
   - **Login as Cashier (PIN: 0000)**:
     * Verify navigation bar displays only allowed modules (POS, Online, Returns, Barcodes, Shift Close).
     * Verify Dashboard, Analytics, Inventory, Purchases, Settings are hidden.
     * In POS, verify price cannot be manually modified and custom discount is disabled.
     * In Shift Close, verify profit figures are masked.
   - **Login as Accountant (PIN: 5678)**:
     * Verify Analytics, Invoices, Inventory, Purchases, Debtors are accessible.
     * Verify Settings and Invoice deletion are blocked.
     * Verify profit and cost metrics are visible.
   - **Login as Manager (PIN: 1234)**:
     * Verify all 20 modules and Settings are accessible.
     * In Settings, verify the "المستخدمين والصلاحيات" tab allows adding/editing staff, setting PINs, toggling permissions, and deleting users.

3. **Database Integrity**:
   - Verify `user_permissions` rows update immediately upon toggling permissions in Settings without SQLite locking errors.
