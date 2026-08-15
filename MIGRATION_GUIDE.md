# Migration Guide

This guide explains how the codebase was migrated from v1.x to v2.0.0 and how to continue working with the new architecture.

## What Changed

### 1. Module Imports

**Before (v1.x):**
```javascript
import { db, generateId, formatCurrency } from '../db';

const loadProducts = async () => {
  const data = await db.query('SELECT * FROM inventory WHERE qty > 0 ORDER BY name');
  setProducts(data);
};
```

**After (v2.0.0):**
```javascript
import { useInventoryStore } from '../stores/useInventoryStore.js';
import { formatCurrency, generateId } from '../utils/helpers.js';

const { products, loadProducts } = useInventoryStore();

// Component:
useEffect(() => { loadProducts(); }, [loadProducts]);
```

### 2. Repository Pattern

All direct database access is now centralized in repositories under `src/database/repositories/`.

| Entity | Repository | Table |
|--------|-----------|-------|
| Products | `InventoryRepository` | `inventory` |
| Sales | `SalesRepository` | `sales`, `sale_items` |
| Purchases | `PurchasesRepository` | `purchases` |
| Debtors | `DebtorsRepository` | `debtors`, `debt_history` |
| Withdrawals | `WithdrawalsRepository` | `withdrawals` |
| Capital | `CapitalRepository` | `capital_injections` |
| Gifts | `GiftsRepository` | `gifts` |
| Losses | `LossesRepository` | `losses` |
| Notes | `NotesRepository` | `notes` |
| Categories | `CategoriesRepository` | `categories` |

**Usage:**
```javascript
import { InventoryRepository } from '../database/repositories/InventoryRepository.js';

const inventoryRepo = new InventoryRepository();
const products = await inventoryRepo.findAll({}, 'name ASC');
```

### 3. State Management (Zustand)

Global state is now managed by Zustand stores instead of local component state.

| Store | Purpose |
|-------|---------|
| `useCartStore` | POS cart, pricing, discounts (persisted) |
| `useInventoryStore` | Product catalog, filters, caching |
| `useUIStore` | Modals, toasts, loading states |

**Example:**
```javascript
import { useUIStore } from '../stores/useUIStore.js';

const { showSuccess, showError } = useUIStore();

// Instead of: alert('تم الحفظ بنجاح')
showSuccess('تم الحفظ بنجاح');
```

### 4. Toast System Replaces alert()/confirm()

| Old | New |
|-----|-----|
| `alert('خطأ')` | `showError('خطأ')` |
| `alert('تم')` | `showSuccess('تم')` |
| `confirm('متأكد؟')` | Custom confirm modal or `showWarning` + inline state |

### 5. Custom Hooks

| Hook | Use Case |
|------|----------|
| `useAsync` | Async data fetching with loading/error |
| `useDebounce` | Debounce search inputs |
| `usePagination` | Paginated lists |
| `useKeyboardShortcuts` | F1-F12, Ctrl+combos |
| `useClickOutside` | Close modals/dropdowns |
| `useMediaQuery` | Responsive design |
| `useLocalStorage` | Persist state |
| `useOptimisticUpdate` | Optimistic UI with rollback |

## Database Schema (unchanged)

The database schema is **unchanged** from v1.x. All 15 tables remain identical, ensuring zero data migration risk. Existing `aldaffa_erp.db` files continue to work.

## Known Deprecated Patterns

These patterns still work but are deprecated — migrate away from them:

1. Direct `db.query()` in components → use repositories
2. `alert()`/`confirm()` → use `useUIStore` toasts
3. Local `useState` for shared data → use Zustand stores
4. `../db` import → use `../database/connection.js` + `../utils/helpers.js`

## Adding a New Module

1. Create `src/modules/YourModule.jsx`
2. Create a repository if needed: `src/database/repositories/YourEntityRepository.js`
3. Add to the modules array in `src/App.jsx`
4. Use stores + repositories, never direct `db` calls
5. Include loading/empty/error states
6. Use `useUIStore` for feedback
