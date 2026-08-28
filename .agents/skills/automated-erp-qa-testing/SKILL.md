---
name: automated-erp-qa-testing
description: Multi-suite automated QA testing guidelines for Electron ERP systems. Covers SQLite test harnesses, atomic transaction rollbacks, stress testing, and zero-negative boundary checks.
---

# Automated ERP QA Testing Skill

This skill provides testing methodology for validating business rules, database integrity, and UI actions.

## Core QA Testing Methodology
1. **Isolated Test Database**: Execute automated tests against a dedicated in-memory or temporary SQLite database (`test-db.js`) to prevent mutating live business data.
2. **Transaction Rollback Testing**: Verify that mid-stream database errors (e.g., constraint violations or syntax errors) automatically trigger clean atomic rollbacks.
3. **Adversarial Stress Testing**: Test system resilience under high-volume dataset seeding (2,000+ items, 1,000+ sales transactions) and rapid user PIN switching.
4. **Boundary & Edge Case Coverage**: Enforce test assertions for boundary conditions including 0 price, negative inventory adjustments, and 100% discount invoices.
