---
name: cash-drawer-shift-reconciliation
description: Mathematical precision guidelines for POS shift closing, cash drawer reconciliation, cash returns subtraction, Weighted Average Cost (WAC) calculations, and financial invariants.
---

# Cash Drawer & Shift Reconciliation Skill

This skill enforces mathematical formulas and reconciliation rules for shift closures and inventory accounting.

## Core Financial Invariants
1. **Cash Drawer Reconciliation Formula**:
   `Expected Cash = Initial Cash + Cash Sales + Capital Injections - Cash Withdrawals - Cash Purchases - Cash Returns`
2. **Weighted Average Cost (WAC)**:
   `New WAC = ((Old Qty * Old WAC) + (Purchased Qty * Purchase Unit Cost)) / Total New Qty`
3. **Cash Returns Subtraction**: Always subtract cash refund totals from expected cash drawer totals during shift closing reconciliation.
4. **Rounding Consistency**: Round monetary values to 2 decimal places using `Math.round(val * 100) / 100` to eliminate IEEE 754 floating point inaccuracies.
