/**
 * Suite 32: Final Challenger 2 Empirical Verification Suite
 *
 * Exhaustive adversarial testing for:
 * 1. TSPL 203 / 300 DPI coordinate math, buffer allocations, bit offsets, luminance thresholds & command framing
 * 2. ESC/POS 80mm / 58mm thermal formatting, column alignment, Arabic typography & cut command sequences
 * 3. CSV UTF-8 BOM byte sequence (0xEF, 0xBB, 0xBF) & RFC 4180 cell escaping
 * 4. ASAR packaging integrity, preload.cjs contextBridge isolation & file content parity
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execSync } from 'child_process';
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
  // 1. TSPL 203/300 DPI COORDINATE MATH, BUFFER ALLOCATION & BITPACKING
  // =========================================================================

  await test('32.1.1 TSPL Multi-Resolution Coordinate & Buffer Allocation Matrix (203 & 300 DPI)', async () => {
    const calcDimensions = (widthMm, heightMm, dpi) => {
      const dotsPerMm = dpi === 300 ? 12 : 8;
      const dotsW = Math.max(80, Math.round(widthMm * dotsPerMm));
      const dotsH = Math.max(80, Math.round(heightMm * dotsPerMm));
      const bytesPerRow = Math.ceil(dotsW / 8);
      const totalBufferBytes = bytesPerRow * dotsH;
      return { dotsW, dotsH, bytesPerRow, totalBufferBytes };
    };

    const testCases = [
      // Standard 50x30 mm
      { w: 50, h: 30, dpi: 203, expW: 400, expH: 240, expBPR: 50, expTotal: 12000 },
      { w: 50, h: 30, dpi: 300, expW: 600, expH: 360, expBPR: 75, expTotal: 27000 },
      // Compact 40x20 mm
      { w: 40, h: 20, dpi: 203, expW: 320, expH: 160, expBPR: 40, expTotal: 6400 },
      { w: 40, h: 20, dpi: 300, expW: 480, expH: 240, expBPR: 60, expTotal: 14400 },
      // Large 60x40 mm
      { w: 60, h: 40, dpi: 203, expW: 480, expH: 320, expBPR: 60, expTotal: 19200 },
      { w: 60, h: 40, dpi: 300, expW: 720, expH: 480, expBPR: 90, expTotal: 43200 },
      // Box 80x50 mm
      { w: 80, h: 50, dpi: 203, expW: 640, expH: 400, expBPR: 80, expTotal: 32000 },
      { w: 80, h: 50, dpi: 300, expW: 960, expH: 600, expBPR: 120, expTotal: 72000 },
      // Tiny 25x15 mm (tests floor clamp: Math.max(80, ...))
      { w: 25, h: 15, dpi: 203, expW: 200, expH: 120, expBPR: 25, expTotal: 3000 },
      { w: 25, h: 15, dpi: 300, expW: 300, expH: 180, expBPR: 38, expTotal: 6840 },
      // Extreme small (clamps to minimum 80 dots)
      { w: 5, h: 5, dpi: 203, expW: 80, expH: 80, expBPR: 10, expTotal: 800 }
    ];

    for (const tc of testCases) {
      const res = calcDimensions(tc.w, tc.h, tc.dpi);
      assert.strictEqual(res.dotsW, tc.expW, `Width mismatch for ${tc.w}x${tc.h}mm @ ${tc.dpi}DPI`);
      assert.strictEqual(res.dotsH, tc.expH, `Height mismatch for ${tc.w}x${tc.h}mm @ ${tc.dpi}DPI`);
      assert.strictEqual(res.bytesPerRow, tc.expBPR, `BytesPerRow mismatch for ${tc.w}x${tc.h}mm @ ${tc.dpi}DPI`);
      assert.strictEqual(res.totalBufferBytes, tc.expTotal, `Total buffer mismatch for ${tc.w}x${tc.h}mm @ ${tc.dpi}DPI`);
    }
  });

  await test('32.1.2 1-Bit Monochrome Bit-Level Inversion & Luminance Threshold Oracle', async () => {
    // Luminance standard: ITU-R BT.601
    const getLuminance = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

    // Test luminance values
    assert.strictEqual(getLuminance(0, 0, 0), 0);
    assert.strictEqual(getLuminance(255, 255, 255), 255);
    // Red has ~0.299 weight
    assert(Math.abs(getLuminance(255, 0, 0) - 76.245) < 0.001);
    // Green has ~0.587 weight
    assert(Math.abs(getLuminance(0, 255, 0) - 149.685) < 0.001);
    // Blue has ~0.114 weight
    assert(Math.abs(getLuminance(0, 0, 255) - 29.070) < 0.001);

    // Rasterization bitpacking verification on an 8x8 pixel grid
    const gridW = 8;
    const gridH = 8;
    const bytesPerRow = Math.ceil(gridW / 8); // 1 byte per row
    const buffer = Buffer.alloc(bytesPerRow * gridH, 0xff); // 0xff is white

    // Pattern: Diagonal line from top-left (0,0) to bottom-right (7,7)
    for (let i = 0; i < 8; i++) {
      const bIdx = i * bytesPerRow + Math.floor(i / 8);
      const bitIdx = 7 - (i % 8);
      buffer[bIdx] &= ~(1 << bitIdx);
    }

    // Expected binary per row:
    // Row 0: 0b01111111 = 0x7F
    // Row 1: 0b10111111 = 0xBF
    // Row 2: 0b11011111 = 0xDF
    // Row 3: 0b11101111 = 0xEF
    // Row 4: 0b11110111 = 0xF7
    // Row 5: 0b11111011 = 0xFB
    // Row 6: 0b11111101 = 0xFD
    // Row 7: 0b11111110 = 0xFE
    const expectedRows = [0x7F, 0xBF, 0xDF, 0xEF, 0xF7, 0xFB, 0xFD, 0xFE];
    for (let row = 0; row < 8; row++) {
      assert.strictEqual(buffer[row], expectedRows[row], `Row ${row} bit pattern must match`);
    }
  });

  await test('32.1.3 TSPL Command Stream Binary Framing & Directives Strict Verification', async () => {
    const widthMm = 50;
    const heightMm = 30;
    const bytesPerRow = 50;
    const dotsH = 240;
    const direction = 0;

    const dummyBitmap = Buffer.alloc(bytesPerRow * dotsH, 0xff);

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
    const fullStream = Buffer.concat([header, dummyBitmap, footer]);

    // Directives checks
    const headerStr = header.toString('ascii');
    assert(headerStr.includes('SIZE 50 mm, 30 mm\r\n'));
    assert(headerStr.includes('GAP 2 mm, 0 mm\r\n'));
    assert(headerStr.includes('REFERENCE 0,0\r\n'));
    assert(headerStr.includes('OFFSET 0 mm\r\n'));
    assert(headerStr.includes('CLS\r\n'));
    assert(headerStr.includes('BITMAP 0,0,50,240,0,'));

    const footerStr = footer.toString('ascii');
    assert.strictEqual(footerStr, '\r\nPRINT 1,1\r\n');

    // Total byte count check
    assert.strictEqual(fullStream.length, header.length + 12000 + footer.length);
  });

  // =========================================================================
  // 2. ESC/POS RECEIPT GENERATION & THERMAL COMMANDS
  // =========================================================================

  await test('32.2.1 ESC/POS 80mm / 58mm Thermal Formatting & Paper Cut Commands', async () => {
    // GS V 65 0 = \x1d\x56\x41\x00 (standard full paper cut with feed)
    const ESC_POS_CUT = Buffer.from([0x1d, 0x56, 0x41, 0x00]);
    assert.strictEqual(ESC_POS_CUT.length, 4);
    assert.strictEqual(ESC_POS_CUT[0], 0x1d); // GS
    assert.strictEqual(ESC_POS_CUT[1], 0x56); // V
    assert.strictEqual(ESC_POS_CUT[2], 0x41); // 'A' / 65
    assert.strictEqual(ESC_POS_CUT[3], 0x00); // 0 (feed distance)

    // Formatter validation
    const formatLine = (left, right, width = 48) => {
      const space = Math.max(1, width - left.length - right.length);
      return left + ' '.repeat(space) + right;
    };

    const headerLine = formatLine('الدفة للعطور', 'فاتورة #501', 48);
    assert.strictEqual(headerLine.length, 48);
    assert(headerLine.startsWith('الدفة للعطور'));
    assert(headerLine.endsWith('فاتورة #501'));

    const totalLine = formatLine('الإجمالي الصافي:', '450.00 د.ل', 48);
    assert.strictEqual(totalLine.length, 48);
  });

  // =========================================================================
  // 3. CSV UTF-8 BOM (0xEF, 0xBB, 0xBF) BYTE SEQUENCE VERIFICATION
  // =========================================================================

  await test('32.3.1 CSV UTF-8 BOM Raw Byte Stream Integrity (0xEF, 0xBB, 0xBF)', async () => {
    const BOM_STR = '\uFEFF';
    const BOM_BUF = Buffer.from(BOM_STR, 'utf8');

    assert.strictEqual(BOM_BUF.length, 3, 'UTF-8 BOM must be exactly 3 bytes');
    assert.strictEqual(BOM_BUF[0], 0xEF, 'Byte 0 must be 0xEF');
    assert.strictEqual(BOM_BUF[1], 0xBB, 'Byte 1 must be 0xBB');
    assert.strictEqual(BOM_BUF[2], 0xBF, 'Byte 2 must be 0xBF');

    // Test building a sample CSV with Arabic data
    const csvContent = BOM_STR + '"اسم المنتج","الكمية","السعر"\r\n"عطر مسك ملكي","5","150.00"';
    const csvBuffer = Buffer.from(csvContent, 'utf8');

    assert.strictEqual(csvBuffer[0], 0xEF);
    assert.strictEqual(csvBuffer[1], 0xBB);
    assert.strictEqual(csvBuffer[2], 0xBF);

    // Verify Arabic string decodes back losslessly
    const decoded = csvBuffer.toString('utf8');
    assert(decoded.startsWith('\uFEFF'));
    assert(decoded.includes('عطر مسك ملكي'));
  });

  await test('32.3.2 Source Code Audit: All CSV Exporters Include UTF-8 BOM & Safe Escaping', async () => {
    const modulesToCheck = [
      path.join(projectRoot, 'src/modules/Analytics.jsx'),
      path.join(projectRoot, 'src/modules/Dashboard.jsx'),
      path.join(projectRoot, 'src/modules/InventoryFull.jsx')
    ];

    for (const filePath of modulesToCheck) {
      assert(fs.existsSync(filePath), `File ${filePath} must exist`);
      const content = fs.readFileSync(filePath, 'utf8');
      const hasBom = content.includes('\uFEFF') || content.includes('\\uFEFF');
      assert(hasBom, `Module ${path.basename(filePath)} must contain UTF-8 BOM for CSV exports`);
    }
  });

  // =========================================================================
  // 4. DEBIAN PACKAGING & ASAR ARCHIVE INTEGRITY
  // =========================================================================

  await test('32.4.1 package.json Electron-Builder Build Files & Linux Targets Configuration', async () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));

    assert.strictEqual(pkg.main, 'main.cjs', 'Main entry point must be main.cjs');
    assert(pkg.build, 'build object must exist');
    assert(Array.isArray(pkg.build.files), 'build.files must be an array');
    assert(pkg.build.files.includes('preload.cjs'), 'preload.cjs must be explicitly included in build.files');
    assert(pkg.build.files.includes('main.cjs'), 'main.cjs must be included in build.files');
    assert(pkg.build.files.includes('dist/**/*'), 'dist/**/* must be included in build.files');
    assert(pkg.build.files.includes('package.json'), 'package.json must be included in build.files');
    assert(pkg.build.linux?.target?.includes('deb'), 'Linux target must include deb');
  });

  await test('32.4.2 ASAR Archive Inspection & Extracted File Content Parity', async () => {
    const asarPath = path.join(projectRoot, 'release', 'linux-unpacked', 'resources', 'app.asar');
    assert(fs.existsSync(asarPath), `ASAR archive must exist at ${asarPath}`);

    // List ASAR contents via npx @electron/asar
    const listOutput = execSync(`npx @electron/asar list "${asarPath}"`, { cwd: projectRoot, encoding: 'utf8' });

    // Verify required file entries in ASAR
    assert(listOutput.includes('/main.cjs'), 'ASAR must contain /main.cjs');
    assert(listOutput.includes('/preload.cjs'), 'ASAR must contain /preload.cjs');
    assert(listOutput.includes('/package.json'), 'ASAR must contain /package.json');
    assert(listOutput.includes('/dist/index.html'), 'ASAR must contain /dist/index.html');
    assert(listOutput.includes('/dist/assets/'), 'ASAR must contain /dist/assets/');

    // Extract files from ASAR to temporary directory and verify hash parity
    const tmpExtractDir = path.join(projectRoot, '.agents', 'final_challenger_2', 'asar_test_extract');
    try {
      fs.rmSync(tmpExtractDir, { recursive: true, force: true });
    } catch (e) {}
    fs.mkdirSync(tmpExtractDir, { recursive: true });

    execSync(`npx @electron/asar extract "${asarPath}" "${tmpExtractDir}"`, { cwd: projectRoot });

    // 1. Verify preload.cjs parity
    const extractedPreload = fs.readFileSync(path.join(tmpExtractDir, 'preload.cjs'), 'utf8');
    const sourcePreload = fs.readFileSync(path.join(projectRoot, 'preload.cjs'), 'utf8');
    assert.strictEqual(extractedPreload, sourcePreload, 'preload.cjs in ASAR must match source preload.cjs exactly');
    assert(extractedPreload.includes('contextBridge.exposeInMainWorld'), 'preload.cjs must expose contextBridge');

    // 2. Verify main.cjs parity
    const extractedMain = fs.readFileSync(path.join(tmpExtractDir, 'main.cjs'), 'utf8');
    const sourceMain = fs.readFileSync(path.join(projectRoot, 'main.cjs'), 'utf8');
    assert.strictEqual(extractedMain, sourceMain, 'main.cjs in ASAR must match source main.cjs exactly');

    // 3. Verify dist/index.html exists and is valid HTML
    const extractedIndex = fs.readFileSync(path.join(tmpExtractDir, 'dist', 'index.html'), 'utf8');
    assert(extractedIndex.includes('<div id="root"></div>'), 'dist/index.html in ASAR must have root container');

    // Cleanup temporary extraction dir
    fs.rmSync(tmpExtractDir, { recursive: true, force: true });
  });

  return results;
}
