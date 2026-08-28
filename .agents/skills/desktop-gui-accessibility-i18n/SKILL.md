---
name: desktop-gui-accessibility-i18n
description: Desktop GUI accessibility and RTL Arabic internationalization standards. Covers RTL layout, keyboard shortcuts (F1-F12), font scaling, and screen resolution adaptation.
---

# Desktop GUI Accessibility & i18n Skill

This skill provides layout, typography, and internationalization standards for Arabic desktop applications.

## Core GUI Guidelines
1. **RTL First Alignment**: Set `dir="rtl"` and `lang="ar"` on root HTML containers. Use logical CSS properties (`margin-inline-start`, `padding-inline-end`) for consistent layout spacing.
2. **Keyboard Accelerators**: Map POS and checkout actions to standard function keys (e.g. `F1` for Search, `F2` for Checkout, `F12` for Cash Drawer) to support keyboard-only operation.
3. **Adaptive Resolution Layouts**: Design views to fit seamlessly across 1366x768 up to 4K resolutions without vertical scrollbar clipping or text overflows.
4. **Font Fallbacks**: Use clean, legible Arabic typefaces (`Segoe UI`, `Tahoma`, `System-UI`) with explicit line-height (1.4 - 1.6) for clear readability.
