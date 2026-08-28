---
name: thermal-printing-engine
description: Advanced TSPL & ESC/POS thermal barcode and receipt printing skill for 203/300 DPI printers. Ensures 1:1 pixel scaling, centered label alignment, USB/CUPS streaming, and multi-label size support.
---

# Thermal Printing Engine Skill

This skill provides standards for thermal label and receipt printing in Electron desktop ERPs.

## Core Printing Guidelines
1. **1:1 Resolution Scaling**: Compute exact pixel dimensions at 203 DPI (`8 dots/mm`) or 300 DPI (`12 dots/mm`). Force BrowserWindow capture resizing to match target resolution (`e.g. 400x240 for 50x30mm`).
2. **TSPL Origin Calibration**: Include `REFERENCE 0,0`, `OFFSET 0 mm`, and `CLS` in TSPL command streams to prevent label origin drift.
3. **Structured Label Pass**: Pass pre-constructed label HTML arrays (`labels`) directly to direct printing handlers to avoid string splitting or unclosed HTML tag truncation.
4. **Thermal Receipt Formatting**: Use monospace fonts, high contrast pure black (#000), and auto-calculated height containers for ESC/POS continuous roll receipts.
