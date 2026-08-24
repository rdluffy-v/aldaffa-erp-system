/**
 * ============================================================================
 * STANDARD CODE-128 BARCODE GENERATOR (100% OFFLINE & SCANNABLE)
 * ============================================================================
 * Generates true, scanner-compatible Code-128 vector barcodes (SVG & React).
 * Works reliably with all laser, CCD, and 2D camera barcode scanners.
 */

import React from 'react';

// Code 128 Patterns (Table B)
const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112' // 106 = Stop
];

const START_B = 104;
const STOP = 106;

/**
 * Encode an ASCII string to Code 128 barcode bars
 * @param {string} text - Alphanumeric string
 * @returns {Array<number>} Array of modules (1 for bar, 0 for space)
 */
export const encodeCode128 = (text) => {
  if (!text || typeof text !== 'string') return [];
  const clean = text.trim();
  if (!clean) return [];

  const values = [START_B];
  let checksum = START_B;

  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i) - 32; // Code 128B ASCII offset
    const val = code >= 0 && code <= 95 ? code : 0;
    values.push(val);
    checksum += val * (i + 1);
  }

  const checkDigit = checksum % 103;
  values.push(checkDigit);
  values.push(STOP);

  // Convert pattern strings to module bit stream
  const modules = [];
  values.forEach((val) => {
    const pattern = CODE128_PATTERNS[val];
    if (pattern) {
      let isBar = true;
      for (let j = 0; j < pattern.length; j++) {
        const width = parseInt(pattern[j], 10);
        for (let k = 0; k < width; k++) {
          modules.push(isBar ? 1 : 0);
        }
        isBar = !isBar;
      }
    }
  });

  return modules;
};

/**
 * Generate 100% Offline Standalone SVG String for Printing
 */
export const generateBarcodeSvgString = (code, width = 160, height = 50, showText = true) => {
  const cleanCode = String(code || '').trim() || 'AL-000000';
  const modules = encodeCode128(cleanCode);

  if (modules.length === 0) return '';

  const quietZone = 6;
  const totalModules = modules.length + quietZone * 2;
  const moduleWidth = Math.max(1, Math.floor(width / totalModules));
  const totalBarcodeWidth = totalModules * moduleWidth;
  const startOffset = Math.max(0, Math.floor((width - totalBarcodeWidth) / 2));
  const barHeight = showText ? Math.max(22, height - 14) : height - 2;

  let rectsHtml = '';
  for (let idx = 0; idx < modules.length; idx++) {
    if (modules[idx]) {
      const x = startOffset + (idx + quietZone) * moduleWidth;
      rectsHtml += `<rect x="${x}" y="1" width="${moduleWidth}" height="${barHeight}" fill="#000000" shape-rendering="crispEdges"/>`;
    }
  }

  const textSvg = showText
    ? `<text x="${Math.floor(width / 2)}" y="${height - 1}" text-anchor="middle" fill="#000000" font-size="10" font-weight="900" font-family="monospace" letter-spacing="1.5">${cleanCode}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="display:block; margin:0 auto; background:#FFFFFF;">
    <rect x="0" y="0" width="${width}" height="${height}" fill="#FFFFFF"/>
    ${rectsHtml}
    ${textSvg}
  </svg>`;
};

/**
 * Scannable Barcode SVG React Component
 */
export const BarcodeSVG = ({
  value,
  width = 160,
  height = 50,
  showText = true,
  className = '',
  barColor = '#000000',
  textColor = '#000000'
}) => {
  const code = String(value || '').trim() || 'AL-000000';
  const modules = encodeCode128(code);

  if (modules.length === 0) {
    return <div className="text-red-500 text-xs">باركود غير صالح</div>;
  }

  const quietZone = 6;
  const totalModules = modules.length + quietZone * 2;
  const moduleWidth = Math.max(1, Math.floor(width / totalModules));
  const totalBarcodeWidth = totalModules * moduleWidth;
  const startOffset = Math.max(0, Math.floor((width - totalBarcodeWidth) / 2));
  const barHeight = showText ? Math.max(22, height - 14) : height - 2;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`select-none ${className}`}
      style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="0" y="0" width={width} height={height} fill="#FFFFFF" />

      {modules.map((isBar, idx) => {
        if (!isBar) return null;
        const x = startOffset + (idx + quietZone) * moduleWidth;
        return (
          <rect
            key={idx}
            x={x}
            y={1}
            width={moduleWidth}
            height={barHeight}
            fill={barColor}
            shapeRendering="crispEdges"
          />
        );
      })}

      {showText && (
        <text
          x={Math.floor(width / 2)}
          y={height - 1}
          textAnchor="middle"
          fill={textColor}
          fontSize="10"
          fontWeight="900"
          fontFamily="monospace"
          letterSpacing="1.5"
        >
          {code}
        </text>
      )}
    </svg>
  );
};

export default BarcodeSVG;
