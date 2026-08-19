---
name: desktop-erp-troubleshooting-patterns
description: >-
  Essential architectural guardrails, debugging patterns, and preventative rules for
  Electron, React, SQLite, and Desktop ERP applications. Use when diagnosing single-character
  focus loss, SQLite schema migrations, offline-first isolation, WAL checkpointing,
  receipt printing, or multi-step manufacturing wizards.
---

# Desktop ERP Architecture, Troubleshooting & Preventative Guardrails

This skill encapsulates all real-world architectural bugs, root-cause analyses, and battle-tested solutions developed across enterprise Electron + React + SQLite ERP systems. Follow these patterns to prevent regressions and build resilient desktop applications.

---

## 1. Input Focus Stealing Prevention (Single-Character Keystroke Loss)

### The Anti-Pattern
Typing a single character into an input field (e.g. search bars, form inputs inside modals) causes the input to immediately lose focus, requiring the user to click the field again for every subsequent character.

```jsx
// ❌ WRONG: Passing unstable callback or re-focusing on every render
useEffect(() => {
  if (isOpen) {
    window.setTimeout(() => modalRef.current?.focus(), 0);
  }
}, [isOpen, onClose]); // onClose changes on every parent re-render!
```

### The Battle-Tested Solution
1. **Never add unstable callbacks to `useEffect` dependency arrays**: Store parent callbacks in a `useRef`.
2. **Conditional Panel Focusing**: Check `document.activeElement`. Only focus the modal panel on initial mount IF focus is not already inside an input element.

```jsx
// ✅ CORRECT: Stable ref pattern & safe focus management
const onCloseRef = useRef(onClose);
useEffect(() => {
  onCloseRef.current = onClose;
}, [onClose]);

useEffect(() => {
  if (!isOpen) return;

  // Only focus modal panel on initial open if an input inside is NOT already focused
  const timer = window.setTimeout(() => {
    if (modalRef.current && !modalRef.current.contains(document.activeElement)) {
      modalRef.current.focus();
    }
  }, 30);

  return () => window.clearTimeout(timer);
}, [isOpen]); // Only depends on isOpen
```

---

## 2. Defensive SQLite Schema Migrations & Introspection

### The Anti-Pattern
Running `ALTER TABLE table_name ADD COLUMN column_name ...` directly in initialization or sandbox scripts causes `SqliteError: duplicate column name` or crashes when columns already exist or differ between versions.

### The Battle-Tested Solution
Always inspect `PRAGMA table_info` before attempting any schema modification:

```javascript
// ✅ CORRECT: Safe defensive column migration
function safeAddColumn(db, tableName, columnName, columnDefinition) {
  try {
    const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all();
    const existingColumns = new Set(tableInfo.map((col) => col.name.toLowerCase()));
    
    if (!existingColumns.has(columnName.toLowerCase())) {
      db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`).run();
      console.log(`Successfully added column '${columnName}' to '${tableName}'`);
    }
  } catch (err) {
    console.error(`Migration check failed for ${tableName}.${columnName}:`, err);
  }
}
```

---

## 3. Safe WAL Checkpoint & Zero-Data-Loss Exit Routine

### The Anti-Pattern
SQLite with WAL mode (`PRAGMA journal_mode = WAL`) holds uncommitted pages in `.db-wal`. Abrupt Electron termination or updater restart can cause recent transactions to be lost or corrupted.

### The Battle-Tested Solution
1. Execute `PRAGMA wal_checkpoint(FULL)` on `before-quit` and `window-all-closed`.
2. Automatically trigger an exit backup to `userData/backups/`.

```javascript
// ✅ CORRECT: Graceful exit flush and backup in main.cjs
function safeFlushAndBackup() {
  if (db) {
    try {
      // 1. Force WAL checkpoint to flush all memory pages to disk
      db.pragma('wal_checkpoint(FULL)');

      // 2. Automated timestamped backup
      const userDataPath = app.getPath('userData');
      const backupsDir = path.join(userDataPath, 'backups');
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }
      const backupPath = path.join(backupsDir, 'aldaffa_auto_exit_backup.db');
      db.backup(backupPath)
        .then(() => console.log('Auto exit database backup created'))
        .catch((e) => console.error('Failed auto exit backup:', e));
    } catch (e) {
      console.error('Safe flush on exit error:', e);
    }
  }
}

app.on('window-all-closed', () => {
  safeFlushAndBackup();
  if (process.platform !== 'darwin') {
    if (db) {
      try { db.close(); } catch (e) {}
    }
    app.quit();
  }
});

app.on('before-quit', () => {
  safeFlushAndBackup();
  if (db) {
    try { db.close(); } catch (e) {}
  }
});
```

---

## 4. Strict Offline-First Isolation Architecture

### The Rule
All ERP core operational modules (**POS/Cashier, Inventory, Returns, Customers, Suppliers, Perfume Mix Lab, Reports, and Settings**) must operate **100% offline** with zero internet dependency.

### Requirements:
1. **Zero External CDN Dependencies**: Bundle all fonts (`Tajawal`, `Cairo`, `Inter`), icons (`lucide-react`), and assets locally in `dist/`.
2. **Safe Error Boundaries**: Any module that requires internet (e.g. AI Assistant, Auto-Updater) must be isolated with try/catch and distinct offline UI states so a network failure never affects the rest of the application.
3. **Local Database Operations**: All data manipulation must execute directly through local SQLite queries via IPC, never through remote HTTP APIs.

---

## 5. POS Thermal 80mm & A4 Print Engine Best Practices

### Architecture:
- Render receipts using isolated hidden `BrowserWindow` instances loaded with `data:text/html;charset=utf-8,${encodeURIComponent(html)}`.
- Support live visual customizers in Settings:
  - **Themes**: Classic (`classic`), Luxury Gold (`luxury_gold`), Modern Minimal (`modern_minimal`), Ornate Box (`ornate_box`).
  - **Divider Borders**: Dashed (`dashed`), Solid (`solid`), Double (`double`), None (`none`).
  - **Watermark/Artwork**: Base64 encoded background layer with subtle opacity (`opacity: 0.08 - 0.10`).
  - **Standardized Currency**: Always use standard application currency helper (`formatCurrency`) rather than hardcoded currency strings.

---

## 6. Compound Product & Multi-Step Manufacturing Wizard Pattern

When designing multi-variable manufacturing workflows (such as perfume oil blending, bottle packaging, and batch cost calculation):
1. **Interactive Step-by-Step State Machine**: Break complex formulas into guided questions:
   - Step 1: Container / Bottle sizing & batch quantity.
   - Step 2: Multi-raw-material selection & dosage (ml/g).
   - Step 3: Solvent / Alcohol ratio & concentration rating (Parfum / EDP / EDT).
   - Step 4: Product identity, barcode generation, unit cost & retail/wholesale pricing with margins.
   - Step 5: Full editable review card before final commitment.
2. **Atomic Inventory Stock Deduction**: On approval, execute an atomic transaction that:
   - Deducts all consumed raw materials from inventory stock.
   - Inserts the new compound finished product under the compound category.
   - Archives the formula recipe in the product notes.

---

## 7. Dual-Channel Release Publishing & Auto-Updater Strategy

For private GitHub repositories or restricted CI/CD environments where electron-builder publish encounters 404/scope issues:
1. **Build Artifacts Locally**: Run `npx electron-builder --linux deb`.
2. **Calculate SHA-512 & Generate `latest-linux.yml`**:
   ```bash
   openssl dgst -sha512 -binary release/app.deb | base64
   ```
3. **Direct Asset Streaming via GitHub REST API**: Use direct HTTPS uploads to `https://uploads.github.com/repos/{owner}/{repo}/releases/{release_id}/assets` for full reliability.

---

## 8. Interactive Purchasing & Receiving Wizard with Automated Post-Commit Barcode Studio

### The Problem
Traditional flat ERP purchase forms overwhelm operators with 15+ simultaneous input fields, lead to input errors, and require cumbersome manual navigation to print barcodes after receiving stock. Text placeholder barcodes (`||| |||| ||`) cannot be read by physical optical/laser scanners.

### The Solution & Pattern
1. **Interactive 4-Step Progressive State Machine**:
   - **Step 1 (Supplier & Invoice Metadata)**: Supplier name, phone (optional), supplier invoice reference, purchase date, payment method (cash/card/bank/debt).
   - **Step 2 (Products, Units & Quantities)**: Existing stock selection or new item creation, rich perfume unit selector (`قطعة`, `زجاجة`, `مل`, `لتر`, `تولة`, `جرام`, `كرتونة`), real-time stock indicator, unit cost, suggested retail price, and valid standard barcode generator.
   - **Step 3 (Storage, Batch & Quality Metadata)**: Batch/lot number, warehouse shelf location, expiry date, delivery notes.
   - **Step 4 (Comprehensive Review & Grand Total)**: Full summary review card before transactional database commit.
2. **Automated Post-Commit Barcode Studio**:
   - Immediately upon committing the invoice, automatically open the dedicated Barcode Studio with all line items pre-populated.
   - Operators can toggle which items to print, adjust exact label counts per item (`+` / `-`), or use 1-click presets (`same as invoice qty` / `1 sticker per item`).
3. **100% Offline True Vector Scannable Barcode Standard**:
   - Never use fake text characters or CSS font approximations.
   - Use clean, mathematically compliant SVG vector renderers (Code-128B / EAN-13) with precise module widths, quiet zones, high contrast (`#FFFFFF` background, `#000000` bars), and crisp edge rendering for guaranteed laser/CCD scanner readability on 50x30mm thermal rolls and A4 sheets.
