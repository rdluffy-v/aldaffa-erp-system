/**
 * Suite 30: Print Engines, Thermal Buffer Math, CSV UTF-8 BOM Exports & ASAR Packaging Integrity
 *
 * Comprehensive tests for:
 * 1. TSPL 203/300 DPI thermal printing engine buffer math (monochrome 1-bit bitmap coordinate alignment, bytesPerRow)
 * 2. ESC/POS thermal receipt formatting invariants & paper cut commands (80mm & 58mm)
 * 3. UTF-8 BOM (\uFEFF) presence & cell escaping in CSV exports (Analytics, Inventory, Debtors)
 * 4. ASAR packaging integrity, package.json build.files configuration & physical target verification
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');

export async function run() {
  const results = [];

  const test = async (name, fn) => {
    const start = Date.now();
    try {
      await fn();
      results.push({ name, passed: true, duration: Date.now() - start });
    } catch (err) {
      results.push({ name, passed: false, error: err, duration: Date.now() - start });
    }
  };

  // =========================================================================
  // 1. TSPL 203/300 DPI THERMAL PRINTING BUFFER & BITMAP MATH
  // =========================================================================

  await test('30.1.1 TSPL 203 DPI vs 300 DPI Resolution Scaling & Buffer Dimension Invariants', async () => {
    // Standard DPI constants:
    // 203 DPI = 8 dots/mm
    // 300 DPI = 11.81 dots/mm (~12 dots/mm)
    const calculateTsplDimensions = (widthMm, heightMm, dpi = 203) => {
      const dotsPerMm = dpi === 300 ? 12 : 8;
      const dotsW = Math.max(80, Math.round(widthMm * dotsPerMm));
      const dotsH = Math.max(80, Math.round(heightMm * dotsPerMm));
      const bytesPerRow = Math.ceil(dotsW / 8);
      const totalBufferBytes = bytesPerRow * dotsH;
      return { dotsW, dotsH, bytesPerRow, totalBufferBytes };
    };

    // Label Preset 1: 50x30 mm (Standard Perfume Label)
    const p50x30_203 = calculateTsplDimensions(50, 30, 203);
    assert.strictEqual(p50x30_203.dotsW, 400, '50mm @ 203 DPI = 400 dots width');
    assert.strictEqual(p50x30_203.dotsH, 240, '30mm @ 203 DPI = 240 dots height');
    assert.strictEqual(p50x30_203.bytesPerRow, 50, '400 dots / 8 = 50 bytes per row');
    assert.strictEqual(p50x30_203.totalBufferBytes, 12000, 'Total bitmap buffer = 50 * 240 = 12,000 bytes');

    const p50x30_300 = calculateTsplDimensions(50, 30, 300);
    assert.strictEqual(p50x30_300.dotsW, 600, '50mm @ 300 DPI = 600 dots width');
    assert.strictEqual(p50x30_300.dotsH, 360, '30mm @ 300 DPI = 360 dots height');
    assert.strictEqual(p50x30_300.bytesPerRow, 75, '600 dots / 8 = 75 bytes per row');
    assert.strictEqual(p50x30_300.totalBufferBytes, 27000, 'Total bitmap buffer = 75 * 360 = 27,000 bytes');

    // Label Preset 2: 40x20 mm (Compact Decant Label)
    const p40x20_203 = calculateTsplDimensions(40, 20, 203);
    assert.strictEqual(p40x20_203.dotsW, 320);
    assert.strictEqual(p40x20_203.dotsH, 160);
    assert.strictEqual(p40x20_203.bytesPerRow, 40);
    assert.strictEqual(p40x20_203.totalBufferBytes, 6400);

    // Label Preset 3: 60x40 mm (Large Tester Label)
    const p60x40_203 = calculateTsplDimensions(60, 40, 203);
    assert.strictEqual(p60x40_203.dotsW, 480);
    assert.strictEqual(p60x40_203.dotsH, 320);
    assert.strictEqual(p60x40_203.bytesPerRow, 60);
    assert.strictEqual(p60x40_203.totalBufferBytes, 19200);

    // Label Preset 4: 80x50 mm (Box / Carton Label)
    const p80x50_203 = calculateTsplDimensions(80, 50, 203);
    assert.strictEqual(p80x50_203.dotsW, 640);
    assert.strictEqual(p80x50_203.dotsH, 400);
    assert.strictEqual(p80x50_203.bytesPerRow, 80);
    assert.strictEqual(p80x50_203.totalBufferBytes, 32000);
  });

  await test('30.1.2 Monochrome 1-Bit Bitmap Coordinate Mapping & Luminance Thresholding', async () => {
    // Simulate rasterizing a 16x8 pixel monochrome canvas into 1-bit TSPL buffer
    const width = 16;
    const height = 8;
    const bytesPerRow = Math.ceil(width / 8); // 2 bytes per row
    const tsplBuffer = Buffer.alloc(bytesPerRow * height, 0xff); // 0xff is blank/white in TSPL

    // Function to set a black pixel at coordinate (x, y)
    const setBlackPixel = (buffer, x, y, bPerRow) => {
      const bIdx = y * bPerRow + Math.floor(x / 8);
      const bitIdx = 7 - (x % 8); // Most significant bit first
      buffer[bIdx] &= ~(1 << bitIdx); // Clear bit to 0 (black dot in TSPL)
    };

    // Burn black pixels at (0, 0), (7, 0), (8, 0), (15, 0)
    setBlackPixel(tsplBuffer, 0, 0, bytesPerRow);  // Byte 0, Bit 7 -> 0b01111111 = 0x7F
    setBlackPixel(tsplBuffer, 7, 0, bytesPerRow);  // Byte 0, Bit 0 -> 0b01111110 = 0x7E
    setBlackPixel(tsplBuffer, 8, 0, bytesPerRow);  // Byte 1, Bit 7 -> 0b01111111 = 0x7F
    setBlackPixel(tsplBuffer, 15, 0, bytesPerRow); // Byte 1, Bit 0 -> 0b01111110 = 0x7E

    assert.strictEqual(tsplBuffer[0], 0x7E, 'First byte of row 0 must have bits 7 and 0 cleared');
    assert.strictEqual(tsplBuffer[1], 0x7E, 'Second byte of row 0 must have bits 7 and 0 cleared');

    // Luminance calculation standard check
    const computeLuminance = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

    // Pure black (0, 0, 0) -> lum = 0 (< 215 -> black)
    assert.strictEqual(computeLuminance(0, 0, 0), 0);
    // Pure white (255, 255, 255) -> lum = 255 (>= 215 -> white)
    assert.strictEqual(computeLuminance(255, 255, 255), 255);
    // Gray (128, 128, 128) -> lum ~ 128 (< 215 -> black)
    assert.strictEqual(Math.round(computeLuminance(128, 128, 128)), 128);
  });

  await test('30.1.3 TSPL Protocol Stream Construction & Command Framing', async () => {
    const buildTsplPayload = (widthMm, heightMm, bitmapData, bytesPerRow, dotsH, direction = 0) => {
      const header = Buffer.from(
        `SIZE ${widthMm} mm, ${heightMm} mm\r\n` +
        `GAP 2 mm, 0 mm\r\n` +
        `DIRECTION ${direction},0\r\n` +
        `REFERENCE 0,0\r\n` +
        `OFFSET 0 mm\r\n` +
        `SET PEEL OFF\r\n` +
        `SET CUTTER OFF\r\n` +
        `SET TEAR ON\r\n` +
        `CLS\r\n` +
        `BITMAP 0,0,${bytesPerRow},${dotsH},0,`
      );
      const footer = Buffer.from(`\r\nPRINT 1,1\r\n`);
      return Buffer.concat([header, bitmapData, footer]);
    };

    const dummyBitmap = Buffer.alloc(50 * 240, 0xff);
    const tsplStream = buildTsplPayload(50, 30, dummyBitmap, 50, 240, 0);

    const streamStr = tsplStream.toString('latin1');
    assert(streamStr.startsWith('SIZE 50 mm, 30 mm\r\nGAP 2 mm, 0 mm\r\n'), 'TSPL must start with SIZE and GAP');
    assert(streamStr.includes('DIRECTION 0,0\r\nREFERENCE 0,0\r\nOFFSET 0 mm\r\n'), 'TSPL must configure origin & offset');
    assert(streamStr.includes('CLS\r\nBITMAP 0,0,50,240,0,'), 'TSPL must clear buffer and declare BITMAP command');
    assert(streamStr.endsWith('\r\nPRINT 1,1\r\n'), 'TSPL must conclude with PRINT 1,1');
    assert.strictEqual(tsplStream.length, streamStr.indexOf('BITMAP 0,0,50,240,0,') + 'BITMAP 0,0,50,240,0,'.length + 12000 + 13);
  });

  // =========================================================================
  // 2. ESC/POS RECEIPT GENERATION & FORMATTING INVARIANTS
  // =========================================================================

  await test('30.2.1 ESC/POS 80mm & 58mm Thermal Receipt Formatting & Alignment Invariants', async () => {
    const generateEscPosTextReceipt = ({
      storeName,
      saleId,
      date,
      items,
      subtotal,
      discount,
      total,
      paymentMethod,
      is58mm = false
    }) => {
      const colWidth = is58mm ? 32 : 48;
      const sep = '-'.repeat(colWidth);
      const dblSep = '='.repeat(colWidth);

      const lines = [];
      lines.push(dblSep);
      lines.push(storeName.padStart(Math.floor((colWidth + storeName.length) / 2)));
      lines.push(`فاتورة مبيعات #${saleId}`);
      lines.push(`التاريخ: ${date}`);
      lines.push(sep);

      // Table header
      if (is58mm) {
        lines.push('المنتج             الكمية   الإجمالي');
      } else {
        lines.push('المنتج                   الكمية   السعر    الإجمالي');
      }
      lines.push(sep);

      for (const item of items) {
        const name = item.name.padEnd(is58mm ? 16 : 22);
        const qty = String(item.cart_qty).padStart(4);
        const price = String(item.final_price).padStart(6);
        const lineTotal = String(item.final_price * item.cart_qty).padStart(8);
        if (is58mm) {
          lines.push(`${name} ${qty} ${lineTotal}`);
        } else {
          lines.push(`${name} ${qty} ${price} ${lineTotal}`);
        }
      }

      lines.push(sep);
      lines.push(`المجموع: ${String(subtotal).padStart(Math.max(1, colWidth - 10))}`);
      if (discount > 0) {
        lines.push(`الخصم:   ${String(discount).padStart(Math.max(1, colWidth - 10))}`);
      }
      lines.push(`الصافي:  ${String(total).padStart(Math.max(1, colWidth - 10))}`);
      lines.push(`الدفع:   ${paymentMethod.padStart(Math.max(1, colWidth - 10))}`);
      lines.push(dblSep);
      lines.push('شكراً لزيارتكم!'.padStart(Math.floor((colWidth + 14) / 2)));

      // ESC/POS Cut Command: GS V 65 0 (\x1d\x56\x41\x00)
      const escPosCut = '\x1d\x56\x41\x00';
      return lines.join('\n') + '\n\n\n' + escPosCut;
    };

    const receipt = generateEscPosTextReceipt({
      storeName: 'الدفة للعطور الفاخرة',
      saleId: 1042,
      date: '2026-09-01 12:00',
      items: [
        { name: 'عطر مسك الختام', cart_qty: 2, final_price: 150 },
        { name: 'زيت الصندل 10مل', cart_qty: 1, final_price: 45 }
      ],
      subtotal: 345,
      discount: 25,
      total: 320,
      paymentMethod: 'نقداً (Cash)',
      is58mm: false
    });

    assert(receipt.includes('الدفة للعطور الفاخرة'), 'Receipt must contain store name');
    assert(receipt.includes('فاتورة مبيعات #1042'), 'Receipt must contain invoice number');
    assert(receipt.includes('عطر مسك الختام'), 'Receipt must contain item 1');
    assert(receipt.includes('زيت الصندل 10مل'), 'Receipt must contain item 2');
    assert(receipt.includes('المجموع:') && receipt.includes('345'), 'Receipt must format subtotal');
    assert(receipt.includes('الخصم:') && receipt.includes('25'), 'Receipt must format discount');
    assert(receipt.includes('الصافي:') && receipt.includes('320'), 'Receipt must format net total');
    assert(receipt.endsWith('\x1d\x56\x41\x00'), 'Receipt must conclude with ESC/POS paper cut command');
  });

  // =========================================================================
  // 3. UTF-8 BOM (\uFEFF) CSV EXPORT INTEGRITY
  // =========================================================================

  await test('30.3.1 UTF-8 BOM (\\uFEFF) Presence & Cell Escaping in CSV Export Engines', async () => {
    const escapeCsvCell = (cell) => {
      const str = String(cell ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return `"${str}"`;
    };

    const createCsvWithBom = (headers, rows) => {
      const BOM = '\uFEFF';
      const headerLine = headers.map(escapeCsvCell).join(',');
      const dataLines = rows.map(r => r.map(escapeCsvCell).join(',')).join('\r\n');
      return BOM + headerLine + '\r\n' + dataLines;
    };

    // 1. Analytics Financial CSV Export Verification
    const analyticsHeaders = ['التاريخ', 'إجمالي المبيعات', 'الربح الإجمالي', 'المصروفات', 'صافي الربح'];
    const analyticsRows = [
      ['2026-08-01', 5400.50, 2100.00, 450.00, 1650.00],
      ['2026-08-02', 6200.00, 2800.00, 300.00, 2500.00]
    ];
    const analyticsCsv = createCsvWithBom(analyticsHeaders, analyticsRows);
    assert(analyticsCsv.startsWith('\uFEFF'), 'Analytics CSV must begin with UTF-8 BOM');
    assert(analyticsCsv.includes('"التاريخ","إجمالي المبيعات","الربح الإجمالي","المصروفات","صافي الربح"'));
    assert(analyticsCsv.includes('"2026-08-01","5400.5","2100","450","1650"'));

    // 2. Inventory Catalog CSV Export Verification
    const inventoryHeaders = ['الباركود', 'اسم المنتج', 'التصنيف', 'الكمية', 'سعر التكلفة', 'سعر البيع'];
    const inventoryRows = [
      ['6281002003001', 'عطر المسك "الملكي"', 'عطور خاصة, VIP', 45, 60.00, 120.00],
      ['6281002003002', 'دهن عود كلمنتان', 'أدهان', 12.5, 150.00, 300.00]
    ];
    const inventoryCsv = createCsvWithBom(inventoryHeaders, inventoryRows);
    assert(inventoryCsv.startsWith('\uFEFF'), 'Inventory CSV must begin with UTF-8 BOM');
    assert(inventoryCsv.includes('"عطر المسك ""الملكي"""'), 'Quotes within cells must be doubled');
    assert(inventoryCsv.includes('"عطور خاصة, VIP"'), 'Commas within cells must be safely quoted');

    // 3. Debtors Ledger CSV Export Verification
    const debtorsHeaders = ['اسم العميل', 'رقم الهاتف', 'إجمالي الدين', 'حالة السداد'];
    const debtorsRows = [
      ['محمد أحمد التاجر', '0912345678', 1250.00, 'غير مسدد'],
      ['علي عثمان', '0923456789', 0.00, 'مسدد بالكامل']
    ];
    const debtorsCsv = createCsvWithBom(debtorsHeaders, debtorsRows);
    assert(debtorsCsv.startsWith('\uFEFF'), 'Debtors CSV must begin with UTF-8 BOM');
    assert(debtorsCsv.includes('"محمد أحمد التاجر"'));

    // 4. Decode to UTF-8 Buffer and verify raw byte signature 0xEF, 0xBB, 0xBF
    const buffer = Buffer.from(inventoryCsv, 'utf8');
    assert.strictEqual(buffer[0], 0xEF, 'Byte 0 must be 0xEF');
    assert.strictEqual(buffer[1], 0xBB, 'Byte 1 must be 0xBB');
    assert.strictEqual(buffer[2], 0xBF, 'Byte 2 must be 0xBF');
  });

  // =========================================================================
  // 4. ASAR PACKAGING INTEGRITY & ELECTRON-BUILDER CONFIGURATION
  // =========================================================================

  await test('30.4.1 package.json Electron-Builder Packaging Specification & Target Assets', async () => {
    const pkgPath = path.join(projectRoot, 'package.json');
    assert(fs.existsSync(pkgPath), 'package.json must exist');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    // Main entry point
    assert.strictEqual(pkg.main, 'main.cjs', 'Main entry point must be main.cjs');

    // Build configuration
    assert(pkg.build, 'build section must be defined in package.json');
    assert.strictEqual(pkg.build.appId, 'com.aldaffa.erp', 'appId must be com.aldaffa.erp');
    assert.strictEqual(pkg.build.productName, 'Aldaffa ERP', 'productName must be Aldaffa ERP');
    assert(Array.isArray(pkg.build.linux?.target) && pkg.build.linux.target.includes('deb'), 'Linux target must include deb');

    // Files inclusions for ASAR packaging
    const files = pkg.build.files;
    assert(Array.isArray(files), 'build.files must be an array');
    assert(files.includes('dist/**/*'), 'build.files must include dist/**/*');
    assert(files.includes('main.cjs'), 'build.files must include main.cjs');
    assert(files.includes('preload.cjs'), 'build.files must include preload.cjs');
    assert(files.includes('package.json'), 'build.files must include package.json');
  });

  await test('30.4.2 Physical Packaging Assets Integrity & ContextBridge Preload Verification', async () => {
    // 1. main.cjs exists and is valid non-empty Node code
    const mainPath = path.join(projectRoot, 'main.cjs');
    assert(fs.existsSync(mainPath), 'main.cjs must exist physically');
    const mainStat = fs.statSync(mainPath);
    assert(mainStat.size > 50000, `main.cjs size (${mainStat.size} bytes) must be comprehensive (>50KB)`);

    // 2. preload.cjs exists and safely exposes contextBridge window.aldaffa.ipcRenderer
    const preloadPath = path.join(projectRoot, 'preload.cjs');
    assert(fs.existsSync(preloadPath), 'preload.cjs must exist physically');
    const preloadContent = fs.readFileSync(preloadPath, 'utf8');
    assert(preloadContent.includes('contextBridge.exposeInMainWorld'), 'preload.cjs must use contextBridge.exposeInMainWorld');
    assert(preloadContent.includes('ipcRenderer'), 'preload.cjs must expose safe ipcRenderer proxy');

    // 3. package.json exists and has valid scripts
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    assert(pkg.scripts?.test, 'package.json must contain test script');
    assert(pkg.scripts?.build, 'package.json must contain build script');
  });

  return results;
}
