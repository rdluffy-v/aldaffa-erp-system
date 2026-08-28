---
name: multi-role-rbac-security
description: Role-Based Access Control (RBAC) and security boundary patterns for Desktop ERP applications. Manages Manager/Accountant/Cashier roles, PIN authentication, sole-manager immunity, and financial data masking.
---

# Multi-Role RBAC Security Skill

This skill defines security and permission boundaries for multi-user desktop applications.

## Core Security Rules
1. **Granular Permissions Matrix**: Evaluate user permissions per module (e.g. `pos`, `inventory`, `analytics`, `settings`) and per action (`view`, `edit`, `delete`, `purge`).
2. **Sole Manager Immunity**: Never allow deletion or demotion of the sole remaining Manager user in the database.
3. **Financial Data Masking**: Automatically mask purchase costs, gross margins, and profit charts when a user lacking financial visibility (e.g., Cashier) is active.
4. **PIN Collision Guard**: Enforce unique PIN authentication across all users for rapid user switching.
