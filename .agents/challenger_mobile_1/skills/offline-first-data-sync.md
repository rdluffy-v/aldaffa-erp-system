---
name: offline-first-data-sync
description: Offline-first architecture patterns for desktop ERP applications. Handles local SQLite persistence, offline transaction logs, change data capture (CDC), and backup integrity.
---

# Offline-First Data Sync Skill

This skill provides patterns for building 100% resilient offline-first desktop systems that function without cloud dependency.

## Core Sync & Persistence Rules
1. **Local-First Authority**: SQLite is the single source of truth for all business operations (POS sales, stock counts, shift closures).
2. **Idempotent Mutations**: Use UUIDs / ISO timestamped primary keys for offline created records to allow seamless multi-device merging.
3. **Automated Database Backups**: Support one-click database export/import and historical archiving (`aldaffa_archive_YYYY.json`) with data validation on restore.
4. **Zero Network Hard Blockers**: Never block core business flows (e.g., ringing up a sale or printing a receipt) on network availability or API calls.
