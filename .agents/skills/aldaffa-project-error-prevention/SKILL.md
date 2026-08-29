---
name: aldaffa-project-error-prevention
description: >-
  Comprehensive incident history, root cause analyses, and automated preventative guardrails
  for Aldaffa Perfumes ERP (Electron, React, SQLite, TSPL Thermal Printing, and Auto-Updater).
  Use whenever adding new features, refactoring components, modifying IPC channels, or packaging releases.
---

# Aldaffa ERP Project Error Prevention & Incident Playbook

This master skill documents every single bug, error signature, root cause, and architectural challenge encountered across the lifecycle of the **Aldaffa Perfumes ERP (الدفة للعطور)** application.

Whenever a feature is created, refactored, or released, review this playbook to prevent recurring regressions.

---

## 📋 Comprehensive Incident Matrix

| # | Error Signature / Symptom | Root Cause | Prevention & Guardrail |
|---|---|---|---|
| **1** | `useCallback is not defined` / `ReferenceError: [hook] is not defined` | Missing named import `{ useCallback, useMemo, useState, useEffect }` from `'react'` in JSX module. | Enforce Suite 14 static AST check in `npm test` verifying all hooks are imported before building. |
| **2** | Thermal Label 50x30mm squished in top corner / 1/4 size | Electron High-DPI screen zoom scaling corrupted TSPL bitmap buffer dimensions. | Use direct TSPL2 bitmap buffer generation at strict 203 DPI (`400x240 dots`, `50 bytes/row`) with `REFERENCE 0,0` and `GAP 2 mm, 0 mm`. |
| **3** | `sha512 checksum mismatch, expected: X, got Y` during in-app update | Rebuilding `.deb` produces a new SHA512 hash, but `latest-linux.yml` on GitHub release was not synchronized. | Always compute base64 SHA512 from the binary and upload matching `latest-linux.yml` in the exact same release step. |
| **4** | Fake Green "Connected" printer indicator when USB cord is detached | Checking `hardwareInfo.systemPrinters.length > 0` (configured OS drivers) instead of genuine USB/CUPS hardware state. | Query live Linux `lpstat -p -d` for `Unplugged or turned off` and check active `/dev/usb/lp*` device node existence. |
| **5** | Single-character input loss / typing focus destroyed | Declaring subcomponents or input wrappers *inside* the parent component body, causing re-creation on state change. | Hoist all subcomponents outside parent scope. Use stable keys (`item.id`, never index). |
| **6** | `SqliteError: duplicate column name: [col]` on startup | Running raw `ALTER TABLE ADD COLUMN` without querying table metadata first. | Check `PRAGMA table_info(table_name)` before altering, or wrap with duplicate column catch. |
| **7** | Empty records returned for historical date queries (`WHERE date <= ...`) | Using `+275760-09-13T...` (`new Date(8640000000000000).toISOString()`). In ASCII string collation, `'+'` sorts before `'2'`. | Always use standard upper bounds like `new Date(Date.now() + 86400000).toISOString()` or `${selectedDate}T23:59:59.999Z`. |
| **8** | Cash drawer shift closing balance discrepancy | Omission of Cash Returns in drawer formula: `Expected Cash = Initial + Sales + Injections - Withdrawals - Purchases - Cash Returns`. | Audit all cash transaction streams and subtract refunds strictly from expected drawer balance. |
| **9** | System lockdown from deleting sole manager | Deleting or modifying role of the only remaining Manager user. | Enforce database trigger / repository check: `SELECT COUNT(*) FROM users WHERE role = 'manager'` $\ge 1$. |
| **10** | Arabic CSV exports corrupted in Excel (`Ø¹Ø·Ø±`) | Exporting UTF-8 text without Unicode Byte Order Mark (`\uFEFF`). | Always prepend `\uFEFF` before CSV payload string: `new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })`. |
| **11** | Unregistered IPC channel call (`No handler registered for 'channel'`) | Frontend invokes IPC channel not handled in `main.cjs`. | Enforce Suite 14 automated IPC channel validator in test harness. |
| **12** | Database lock on app exit during WAL backup | Synchronous `db.close()` called while asynchronous `db.backup()` is still pending. | Execute synchronous `db.pragma('wal_checkpoint(FULL)')` before exit. |

---

## 🛠️ Step-by-Step Prevention Rules

### 1. React Hook Import Enforcement
Before compiling or releasing, ensure every React hook used in any `.jsx` file is explicitly imported:
```javascript
// ✅ CORRECT
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

// ❌ WRONG (Causes runtime crash when useCallback is called)
import React, { useState, useEffect } from 'react';
// ...
const handleAction = useCallback(() => { ... }, []);
```

### 2. TSPL 50x30mm Protocol Standard
For Xprinter XP-365B thermal label printing, the required TSPL sequence is:
```text
SIZE 50 mm, 30 mm\r\n
GAP 2 mm, 0 mm\r\n
DIRECTION 0,0\r\n
REFERENCE 0,0\r\n
OFFSET 0 mm\r\n
SET PEEL OFF\r\n
SET CUTTER OFF\r\n
SET TEAR ON\r\n
CLS\r\n
BITMAP 0,0,50,240,0,[BINARY_DATA]
PRINT 1,1\r\n
```

### 3. Release & Auto-Updater Verification Pipeline
Whenever a new desktop package is built:
1. Bump version in `package.json` (e.g. `2.3.27`).
2. Run `npm run build` (Vite production bundle).
3. Run `npm test` (Verify all 16 test suites pass 100%).
4. Package `.deb` with `npx electron-builder --linux deb`.
5. Compute base64 SHA-512 of generated `.deb`.
6. Write matching `latest-linux.yml`.
7. Upload both `.deb` and `latest-linux.yml` to GitHub Releases.

---

## 🧪 Automated Verification Harness
Run the automated test harness at any time to verify application integrity:
```bash
npm test
```
All 16 test suites must pass 100% with 0 failures before any code is committed.
