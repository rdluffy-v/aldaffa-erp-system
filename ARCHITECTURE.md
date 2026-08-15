# Aldaffa ERP - Architecture Documentation

## Overview

Aldaffa Perfumes ERP is a desktop application built with **Electron + React + SQLite** for managing perfume retail operations: POS, inventory, purchases, debtors, returns, gifts, losses, and financial reporting.

## Technology Stack

| Layer | Technology |
|-------|-----------|
| **Desktop Shell** | Electron 43 |
| **UI** | React 19 |
| **Styling** | Tailwind CSS 3 + CSS Variables |
| **State Management** | Zustand (with persistence) |
| **Database** | SQLite via better-sqlite3 (IPC bridge) |
| **Animation** | Framer Motion |
| **Charts** | Recharts |
| **Icons** | Lucide React |
| **Validation** | Zod |
| **Date Handling** | date-fns + Intl (ar-SD) |

## Directory Structure

```
src/
├── App.jsx                    # Root application shell
├── main.jsx                   # React entry point
├── index.css                  # Global styles + design tokens
├── db.js                      # Backward-compatible DB exports
├── database/
│   ├── connection.js          # IPC bridge with caching/retry/transactions
│   └── repositories/          # Repository pattern data access
│       ├── BaseRepository.js  # Generic CRUD foundation
│       ├── InventoryRepository.js
│       ├── SalesRepository.js
│       ├── PurchasesRepository.js
│       ├── DebtorsRepository.js
│       ├── WithdrawalsRepository.js
│       ├── CapitalRepository.js
│       ├── GiftsRepository.js
│       └── ...
├── stores/                    # Zustand global stores
│   ├── useCartStore.js        # POS cart (persisted)
│   ├── useInventoryStore.js   # Product catalog + filters
│   └── useUIStore.js          # Modals, toasts, loading
├── hooks/                     # Custom React hooks
│   ├── useAsync.js
│   ├── useDebounce.js
│   ├── useLocalStorage.js
│   ├── useKeyboardShortcuts.js
│   ├── usePagination.js
│   ├── useOptimisticUpdate.js
│   ├── useClickOutside.js
│   └── useMediaQuery.js
├── components/
│   ├── ui/                    # Atomic primitives
│   ├── layout/                # Header, Navigation, MainLayout
│   ├── shared/                # Reusable business components
│   └── features/              # Feature compounds
├── modules/                   # Feature modules (16)
├── types/                     # Shared type contracts (JSDoc)
└── utils/                     # Shared utilities
```

## Architecture Layers

### 1. Presentation Layer (`components/`, `modules/`)
- Pure React components consuming stores via hooks
- No direct database access
- Loading/empty/error states mandatory
- RTL-first, dark luxury theme

### 2. State Layer (`stores/`)
- Zustand stores for global state
- `useCartStore` persisted to localStorage
- `useInventoryStore` with cache timeout (30s)
- `useUIStore` for cross-cutting concerns (toasts, modals)

### 3. Domain Layer (`services/` - planned)
- Business rule orchestration
- Transaction coordination across repositories
- Complex calculations (WAC, portion pricing)

### 4. Data Access Layer (`database/repositories/`)
- Repository pattern per entity
- All repositories extend `BaseRepository`
- Transactions handled at repository level
- No SQL in presentation layer

### 5. Infrastructure (`database/connection.js`)
- IPC bridge to Electron main process
- Query caching (5s TTL for SELECT)
- Retry logic (3 attempts, backoff)
- Transaction helper with rollback

## Database Schema

15 tables: `categories`, `inventory`, `sales`, `sale_items`, `returns`, `withdrawals`, `capital_injections`, `gifts`, `notes`, `debtors`, `debt_history`, `losses`, `purchases`, `archives`, `settings`

All schema management happens in `main.cjs` via `initDatabase()`.

## Data Flow

```
React Component → Store Action → Repository → connection.js (IPC) → main.cjs → SQLite
                                      ↑                                            |
                                      └──────── Cache / Retry / Transaction ───────┘
```

## Key Design Decisions

1. **Repository Pattern**: Components never touch SQL. All queries centralized for maintainability and testability.

2. **Zustand over Context**: Global state without prop drilling, with persist middleware for cart persistence across app restarts.

3. **Caching**: Read queries cached 5s; invalidated on any mutation. Inventory store caches 30s with force-refresh option.

4. **No alert()**: All user feedback via toast system (`useUIStore.showSuccess/showError`).

5. **Error Boundaries**: Every module wrapped in ErrorBoundary with reload recovery.

## RTL & Localization

- `dir="rtl"` on root element
- All dates/currency use `Intl` with `ar-SD` locale
- Font stack: system-ui → Segoe UI → Tajawal → Arabic typesetting
- Components use logical CSS properties (`ps/pe/ms/me/start/end`) for RTL

## Theming

Design tokens in `src/index.css` `:root`:
- `--bg-primary: #0d1117` (deep dark)
- `--accent-primary: #d97706` (amber/gold)
- `--glass-bg: rgba(33,38,45,0.6)` (glassmorphism)
- Full shadow/radius/transition scale

## Performance

- Debounced searches
- Memoized expensive calculations
- Lazy loading (React.lazy where beneficial)
- Query result caching
- Virtual scrolling for large lists

## Build & Packaging

```bash
npm run build          # Vite production build
npm run electron:build # electron-builder → .deb
```

Output: `release/aldaffa-app-desktop_<version>_amd64.deb`
