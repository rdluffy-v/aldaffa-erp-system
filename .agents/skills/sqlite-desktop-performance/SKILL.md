---
name: sqlite-desktop-performance
description: High-performance SQLite database optimization patterns using better-sqlite3 in Electron ERP applications. Covers WAL mode, indexing, PRAGMA tuning, atomic transactions, and zero-lock execution.
---

# SQLite Desktop Performance Skill

This skill provides database optimization guidelines for `better-sqlite3` in persistent desktop ERP systems.

## Core Performance Guidelines
1. **WAL Mode Execution**: Always enable `PRAGMA journal_mode = WAL;` and `PRAGMA synchronous = NORMAL;` on database initialization for high-concurrency read/write operations.
2. **Indexed Queries**: Maintain covering indexes on foreign keys and frequently queried date/filter columns (`created_at`, `product_id`, `sale_id`, `barcode`).
3. **Atomic Transactions**: Wrap multi-step mutations (POS checkout, inventory adjustments, shift closes) inside synchronous `db.transaction()` blocks to prevent database corruption.
4. **Prepared Statement Caching**: Reuse prepared statements (`db.prepare(sql)`) across calls instead of recompiling SQL strings dynamically.
5. **Single-Quote Literals**: Use single quotes for string values in SQL statements (`WHERE category = 'Perfumes'`) to prevent SQLite from treating strings as column identifiers.
