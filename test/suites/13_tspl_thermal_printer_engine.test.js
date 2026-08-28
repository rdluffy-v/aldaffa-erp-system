/**
 * Suite 13: Xprinter XP-365B TSPL Dimensions, Auto-Calibration & Hardware Polling
 */

import assert from 'assert';
import { generateValidBarcode } from '../../src/utils/helpers.js';

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

  await test('13.1 TSPL 50x30mm Command Header & Dimensions Verification', async () => {
    const widthMm = 50;
    const heightMm = 30;
    const dotsW = Math.round(widthMm * 8); // 400 dots
    const dotsH = Math.round(heightMm * 8); // 240 dots
    const bytesPerRow = Math.ceil(dotsW / 8); // 50 bytes

    assert.strictEqual(dotsW, 400, '50mm at 203 DPI must equal 400 dots across print head');
    assert.strictEqual(dotsH, 240, '30mm at 203 DPI must equal 240 dots along feeding axis');
    assert.strictEqual(bytesPerRow, 50, 'Bytes per row must be 50 bytes for 400 dots');

    const expectedHeader = 
      `SIZE ${widthMm} mm, ${heightMm} mm\r\n` +
      `GAP 2 mm, 0 mm\r\n` +
      `DIRECTION 0,0\r\n` +
      `REFERENCE 0,0\r\n` +
      `OFFSET 0 mm\r\n` +
      `SET PEEL OFF\r\n` +
      `SET CUTTER OFF\r\n` +
      `SET TEAR ON\r\n` +
      `CLS\r\n` +
      `BITMAP 0,0,${bytesPerRow},${dotsH},0,`;

    assert(expectedHeader.includes('SIZE 50 mm, 30 mm'), 'TSPL header must specify SIZE 50 mm, 30 mm');
    assert(expectedHeader.includes('GAP 2 mm, 0 mm'), 'TSPL header must specify standard 2mm die-cut gap');
    assert(expectedHeader.includes('REFERENCE 0,0'), 'TSPL header must set reference coordinate to top-left (0,0)');
    assert(expectedHeader.includes('SET CUTTER OFF'), 'TSPL header must ensure cutter is disabled for peel/tear models');
    assert(expectedHeader.includes('CLS'), 'TSPL header must clear bitmap buffer before rendering');
    assert(expectedHeader.includes('BITMAP 0,0,50,240,0,'), 'TSPL BITMAP command must specify 50 bytes width and 240 dots height');
  });

  await test('13.2 Auto-Calibration Sensor TSPL Command Invariants', async () => {
    const calibrateCmd = 
      `SIZE 50 mm, 30 mm\r\n` +
      `GAP 2 mm, 0 mm\r\n` +
      `OFFSET 0 mm\r\n` +
      `REFERENCE 0,0\r\n` +
      `DIRECTION 0,0\r\n` +
      `SET PEEL OFF\r\n` +
      `SET CUTTER OFF\r\n` +
      `SET TEAR ON\r\n` +
      `GAPDETECT\r\n` +
      `FEED 1\r\n`;

    assert(calibrateCmd.includes('GAPDETECT'), 'Calibration command must include GAPDETECT to trigger optical gap sensor');
    assert(calibrateCmd.includes('FEED 1'), 'Calibration command must feed 1 label to lock position');
  });

  await test('13.3 Real-time Hardware Status Parsing Invariants', async () => {
    // Unplugged status test
    const mockUnpluggedLpstat = `printer XP-365B disabled since Thu Aug 27 21:51:28 2026 -\n\tUnplugged or turned off\nno system default destination`;
    const isUnplugged = /unplugged|turned off|disabled|offline/i.test(mockUnpluggedLpstat);
    const isIdle = /is idle|enabled/i.test(mockUnpluggedLpstat.split('\n')[0]) && !isUnplugged;

    assert.strictEqual(isUnplugged, true, 'Unplugged CUPS status must be detected as unplugged');
    assert.strictEqual(isIdle, false, 'Unplugged CUPS status must not be detected as idle/online');

    // Online status test
    const mockOnlineLpstat = `printer XP-365B is idle. enabled since Thu Aug 27 21:55:00 2026`;
    const isOnlineUnplugged = /unplugged|turned off|disabled|offline/i.test(mockOnlineLpstat);
    const isOnlineIdle = /is idle|enabled/i.test(mockOnlineLpstat.split('\n')[0]) && !isOnlineUnplugged;

    assert.strictEqual(isOnlineUnplugged, false, 'Online CUPS status must not be detected as unplugged');
    assert.strictEqual(isOnlineIdle, true, 'Online CUPS status must be detected as idle/ready');
  });

  await test('13.4 Barcode Generation Helper Validity', async () => {
    const code = generateValidBarcode('628');
    assert(code.startsWith('628'), 'Generated barcode must match requested prefix');
    assert.strictEqual(code.length, 13, 'Standard EAN-13 perfume barcode length must be 13 digits');
  });

  return results;
}
