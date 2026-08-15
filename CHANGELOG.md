# Changelog

All notable changes to the Aldaffa Perfumes ERP application.

## [2.0.0] - 2026-08-08

### 🏗️ Architecture Transformation
- **Clean Architecture** with Domain-Driven Design principles
- **Repository Pattern** for all data access (BaseRepository + 10 entity repositories)
- **Service Layer** preparation for business logic separation
- **Zustand State Management** replacing scattered useState/useEffect data fetching
- **Single source of truth** for database access (src/database/connection.js)

### 🗄️ Database Layer
- Enhanced IPC bridge with query caching (5s TTL)
- Automatic retry logic (3 attempts with backoff)
- Transaction management with rollback support
- Prepared statement caching
- Cache invalidation on mutations
- Backward-compatible exports via src/db.js

### 🎨 UI Component Library
- **10 reusable components** built from scratch:
  - `Button` - 4 variants (primary/secondary/danger/ghost), 3 sizes, loading state
  - `Input` - typed inputs with labels, errors, RTL adornments
  - `Card` - glassmorphic cards with Framer Motion interactions
  - `Modal` - animated modal with ESC/click-outside close, focus trap
  - `ToastContainer` - stacked toast notifications with progress bars
  - `Table` - sortable, paginated, RTL-aware data tables
  - `Header` - branded app header with live date
  - `Navigation` - animated tab navigation with layout animations
  - `SearchBar` - debounced search with clear button
  - `CurrencyInput` - formatted SDG currency input

### 🪝 Custom Hooks (8 new)
- `useAsync` - async operations with loading/error states
- `useDebounce` - debounced value tracking
- `useLocalStorage` - persisted state sync
- `useKeyboardShortcuts` - keyboard shortcut registration
- `usePagination` - pagination state management
- `useOptimisticUpdate` - optimistic UI with rollback
- `useClickOutside` - click-outside detection
- `useMediaQuery` - responsive breakpoint detection

### 📊 New Dashboard Module
- Real-time KPI cards (Sales, Profit, Low Stock, Debtors)
- Revenue vs Profit area chart (Recharts)
- Payment methods pie chart
- Top selling products table
- Recent sales list
- Date range selector (Today/Week/Month)
- Auto-refresh (30s) + CSV export

### ⚡ POS Module Enhancements
- Keyboard shortcuts (F1=search, F2=clear cart, F3=checkout)
- Barcode scanner support
- Loading skeletons
- Toast notifications
- Optimistic UI updates

### 🛡️ Error Handling
- Global ErrorBoundary with reload recovery
- Graceful error states in all modules
- Consistent toast-based feedback (no more alert())

### 🧹 Code Quality
- Removed all inline SQL from components (moved to repositories)
- Removed all alert()/confirm() (moved to toast system)
- Added loading and empty states throughout
- Consistent dark luxury design language

### ⬆️ Dependencies Added
- zustand, zod, date-fns, lucide-react, framer-motion, recharts, react-window

## [1.0.2] - 2026-08-07

### 🐛 Bug Fixes
- Fixed Tailwind CSS integration (missing @tailwind directives)
- Resolved ESM/CommonJS config mismatch (package.json type: module)
- Renamed main.js → main.cjs for Electron compatibility
- Added system font fallbacks (Cairo font files were missing)

## [1.0.1] - 2026-08-07

### 🐛 Bug Fixes
- Fixed broken font references (removed non-existent Cairo font-face)

## [1.0.0] - Initial Release
- 16 functional ERP modules
- Electron + React + SQLite architecture
- Thermal receipt printing (80mm)
- A4 purchase order printing
- Shift report printing
