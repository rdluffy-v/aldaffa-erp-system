# Desktop ERP Architecture & Troubleshooting Patterns

Summary of core methodology:
- Subcomponents must be declared outside parent renders to prevent single-character focus loss.
- SQLite schema migrations must be idempotent.
- SQLite ISO string date comparisons must avoid extreme upper bounds like +275760.
- SQLite WAL mode checkpointing on exit.
- Offline-first purity: local SQLite as single source of truth.
- True Code-128B / EAN-13 SVG barcode engine.
- Cash drawer reconciliation exact formula with variance tracking.
- Electron printing: strict @media print CSS, direct print / PDF CLI pipeline.
- BaseRepository self-healing column sanitization.
- Non-destructive demo sandbox isolation (`is_demo` flag, multi-table atomic purge).
