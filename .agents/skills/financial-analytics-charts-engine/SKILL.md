---
name: financial-analytics-charts-engine
description: Financial analytics dashboard and export engine guidelines. Covers Recharts visualization, financial KPIs, UTF-8 BOM CSV exports, and styled A4 PDF generation.
---

# Financial Analytics & Charts Engine Skill

This skill provides patterns for building executive financial dashboards, interactive profit charts, and report exports.

## Core Analytics Guidelines
1. **Interactive Recharts Dashboards**: Build visual dashboards for Revenue vs Gross Profit, Cash Inflow vs Outflow, Category breakdown, and Payment methods.
2. **Indexed Range Aggregations**: Optimize SQL aggregation queries for date range presets (`today`, `this_week`, `this_month`, `ytd`, `custom`) using date indexes.
3. **Arabic CSV Export Compatibility**: Include UTF-8 Byte Order Mark (`\uFEFF`) at the beginning of exported CSV files to ensure proper rendering of Arabic text in Microsoft Excel.
4. **Styled A4 PDF Generation**: Generate clean executive PDF reports with store branding, currency symbols, and clear financial summary tables via IPC.
