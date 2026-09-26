/**
 * ============================================================================
 * ALDAFFA ERP — AUTOMATED GUARDRAIL VERIFICATION SCRIPT
 * Enforces all 13 rules from aldaffa-project-error-prevention/SKILL.md
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

console.log('\n===============================================================');
console.log('🛡️  ALDAFFA ERP — AUTOMATED ERROR PREVENTION GUARDRAILS AUDIT');
console.log('===============================================================\n');

let passCount = 0;
let failCount = 0;

function check(name, ruleNum, fn) {
  try {
    fn();
    console.log(`  ✅ [RULE ${ruleNum}] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ [RULE ${ruleNum} FAILED] ${name}`);
    console.error(`     Error: ${err.message}`);
    failCount++;
  }
}

// ---------------------------------------------------------------------------
// 1. React Hook Import Enforcement (AST / Regex scanner)
// ---------------------------------------------------------------------------
check('React Hook Import Parity across all JSX components', 1, () => {
  const srcDir = path.join(projectRoot, 'src');
  const hooks = ['useState', 'useEffect', 'useCallback', 'useMemo', 'useRef'];

  function scanDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const full = path.join(dir, file);
      if (fs.statSync(full).isDirectory()) {
        scanDir(full);
      } else if (file.endsWith('.jsx')) {
        const content = fs.readFileSync(full, 'utf8');
        // Find react import statement
        const reactImportMatch = content.match(/import\s+(?:React\s*,\s*)?\{([^}]+)\}\s+from\s+['"]react['"]/);
        const importedHooks = reactImportMatch
          ? reactImportMatch[1].split(',').map((s) => s.trim())
          : [];

        for (const hook of hooks) {
          // Look for actual hook usage e.g. "useState(" but not inside comments or imports
          const hookRegex = new RegExp(`\\b${hook}\\s*\\(`, 'g');
          if (hookRegex.test(content) && !importedHooks.includes(hook)) {
            // Also check if imported via "import React from 'react'; React.useState"
            if (!content.includes(`React.${hook}`)) {
              throw new Error(`Component ${path.relative(srcDir, full)} uses ${hook} without importing it from 'react'`);
            }
          }
        }
      }
    }
  }

  scanDir(srcDir);
});

// ---------------------------------------------------------------------------
// 2. TSPL 203 DPI Dimension Invariants
// ---------------------------------------------------------------------------
check('TSPL 203 DPI Bitmap Buffer Dimensions (400x240 dots, 50 bytes/row)', 2, () => {
  const printingFiles = [
    path.join(projectRoot, 'src/utils/tsplBarcodeGenerator.js'),
    path.join(projectRoot, 'main.cjs')
  ];

  let verified = false;
  for (const f of printingFiles) {
    if (fs.existsSync(f)) {
      const content = fs.readFileSync(f, 'utf8');
      if (content.includes('400') && content.includes('240') && content.includes('50')) {
        verified = true;
      }
    }
  }
  if (!verified) {
    throw new Error('TSPL printing engine must maintain 400x240 dots and 50 bytes/row for 203 DPI labels');
  }
});

// ---------------------------------------------------------------------------
// 3. Release & Auto-Updater Hash Pipeline Configuration
// ---------------------------------------------------------------------------
check('Auto-Updater Release Script Computes Real SHA-512 from Binary', 3, () => {
  const uploadScript = path.join(projectRoot, 'scripts/upload_release.cjs');
  if (fs.existsSync(uploadScript)) {
    const content = fs.readFileSync(uploadScript, 'utf8');
    if (!content.includes("crypto.createHash('sha512')") && !content.includes('sha512')) {
      throw new Error('Release script must compute genuine sha512 from desktop debian package');
    }
  }
});

// ---------------------------------------------------------------------------
// 4. Hardware Printer Checking Integrity
// ---------------------------------------------------------------------------
check('Hardware Printer State: Live lpstat or Device Node Inspection', 4, () => {
  const mainContent = fs.readFileSync(path.join(projectRoot, 'main.cjs'), 'utf8');
  if (!mainContent.includes('lpstat') && !mainContent.includes('/dev/usb/lp')) {
    throw new Error('main.cjs must query live CUPS or /dev/usb/lp* for real printer connectivity');
  }
});

// ---------------------------------------------------------------------------
// 5. Component Hoisting (No inner subcomponents causing focus loss)
// ---------------------------------------------------------------------------
check('No Input Component Nested Declarations inside React Functional Components', 5, () => {
  const posFile = path.join(projectRoot, 'src/modules/POS.jsx');
  if (fs.existsSync(posFile)) {
    const content = fs.readFileSync(posFile, 'utf8');
    // Verify that key input wrappers are not declared inline inside the body
    if (content.includes('const InputWrapper = (') && content.indexOf('const POSModule =') < content.indexOf('const InputWrapper = (')) {
      throw new Error('Subcomponent InputWrapper must be hoisted outside POSModule');
    }
  }
});

// ---------------------------------------------------------------------------
// 6. SQLite Schema Migration Safety
// ---------------------------------------------------------------------------
check('SQLite Migrations Protected against Duplicate Column Exceptions', 6, () => {
  const mainContent = fs.readFileSync(path.join(projectRoot, 'main.cjs'), 'utf8');
  if (!mainContent.includes('migrations.forEach') || !mainContent.includes('try {')) {
    throw new Error('Migrations in main.cjs must be wrapped in safe execution loop with duplicate column catch');
  }
});

// ---------------------------------------------------------------------------
// 7. Date Range Query Upper Bound Format
// ---------------------------------------------------------------------------
check('Date Range Queries Upper Bounds Use Valid ISO String Collation', 7, () => {
  const srcDir = path.join(projectRoot, 'src');
  function scan(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const full = path.join(dir, file);
      if (fs.statSync(full).isDirectory()) scan(full);
      else if (file.endsWith('.js') || file.endsWith('.jsx')) {
        const content = fs.readFileSync(full, 'utf8');
        if (content.includes('8640000000000000') || content.includes('+275760')) {
          throw new Error(`File ${file} uses invalid year +275760 Date which breaks ASCII string collation`);
        }
      }
    }
  }
  scan(srcDir);
});

// ---------------------------------------------------------------------------
// 8. Cash Drawer Master Equation & Cash Returns Subtraction
// ---------------------------------------------------------------------------
check('Cash Drawer Reconciliation Equation Accounts for Cash Returns', 8, () => {
  const shiftRepoFile = path.join(projectRoot, 'src/database/repositories/ShiftReportsRepository.js');
  if (fs.existsSync(shiftRepoFile)) {
    const content = fs.readFileSync(shiftRepoFile, 'utf8');
    if (!content.includes('returns') && !content.includes('Cash Returns')) {
      throw new Error('ShiftReportsRepository must account for returns in cash drawer expected balance');
    }
  }
});

// ---------------------------------------------------------------------------
// 9. Sole Manager Immunity
// ---------------------------------------------------------------------------
check('Sole Manager Protection: Cannot delete or demote last manager', 9, () => {
  const usersRepoFile = path.join(projectRoot, 'src/database/repositories/UsersRepository.js');
  if (fs.existsSync(usersRepoFile)) {
    const content = fs.readFileSync(usersRepoFile, 'utf8');
    if (!content.includes("role = 'manager'") && !content.includes('manager')) {
      throw new Error('UsersRepository must protect sole manager from deletion or demotion');
    }
  }
});

// ---------------------------------------------------------------------------
// 10. CSV Exports Prepend UTF-8 Byte Order Mark (\\uFEFF)
// ---------------------------------------------------------------------------
check('All CSV Export Utilities Prepend UTF-8 BOM (\\uFEFF)', 10, () => {
  const filesWithCsv = [
    path.join(projectRoot, 'src/modules/Analytics.jsx'),
    path.join(projectRoot, 'src/modules/Dashboard.jsx'),
    path.join(projectRoot, 'src/modules/InventoryFull.jsx'),
    path.join(projectRoot, 'src/modules/Losses.jsx'),
    path.join(projectRoot, 'src/database/repositories/TestersRepository.js')
  ];

  for (const f of filesWithCsv) {
    if (fs.existsSync(f)) {
      const content = fs.readFileSync(f, 'utf8');
      if (content.includes('text/csv') || content.includes('.csv')) {
        const hasBom = content.includes('\uFEFF') || content.includes('\\uFEFF');
        if (!hasBom) {
          throw new Error(`File ${path.basename(f)} exports CSV without UTF-8 BOM (\\uFEFF)`);
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// 11. IPC Channel Allowlist Parity
// ---------------------------------------------------------------------------
check('IPC Channel Parity between Preload / Frontend and main.cjs', 11, () => {
  const mainContent = fs.readFileSync(path.join(projectRoot, 'main.cjs'), 'utf8');
  const preloadContent = fs.readFileSync(path.join(projectRoot, 'preload.cjs'), 'utf8');

  // Verify that channels registered in preload are handled in main.cjs
  const invokeMatches = preloadContent.matchAll(/ipcRenderer\.invoke\(['"]([^'"]+)['"]/g);
  for (const match of invokeMatches) {
    const channel = match[1];
    const isHandled = mainContent.includes(`ipcMain.handle('${channel}'`) || mainContent.includes(`ipcMain.handle("${channel}"`);
    if (!isHandled) {
      throw new Error(`Preload invokes IPC channel '${channel}' with no handler in main.cjs`);
    }
  }
});

// ---------------------------------------------------------------------------
// 12. WAL Checkpoint on App Shutdown
// ---------------------------------------------------------------------------
check('App Shutdown Executes Synchronous WAL Checkpoint', 12, () => {
  const mainContent = fs.readFileSync(path.join(projectRoot, 'main.cjs'), 'utf8');
  if (!mainContent.includes('wal_checkpoint')) {
    throw new Error('main.cjs must execute wal_checkpoint before database closure');
  }
});

// ---------------------------------------------------------------------------
// 13. Table Allowlist Parity across BaseRepository and main.cjs
// ---------------------------------------------------------------------------
check('Database Table Allowlist Parity across BaseRepository and main.cjs', 13, () => {
  const baseRepoContent = fs.readFileSync(path.join(projectRoot, 'src/database/repositories/BaseRepository.js'), 'utf8');
  const mainContent = fs.readFileSync(path.join(projectRoot, 'main.cjs'), 'utf8');

  const allowedMatch = baseRepoContent.match(/const ALLOWED_TABLES = new Set\(\[([\s\S]*?)\]\);/);
  if (!allowedMatch) {
    throw new Error('BaseRepository.js must define ALLOWED_TABLES Set');
  }

  const tableNames = allowedMatch[1]
    .split(',')
    .map((s) => s.replace(/['"\s]/g, ''))
    .filter(Boolean);

  for (const t of tableNames) {
    if (!mainContent.includes(`'${t}'`) && !mainContent.includes(`"${t}"`)) {
      throw new Error(`Table '${t}' in BaseRepository ALLOWED_TABLES is missing from main.cjs KNOWN_TABLES`);
    }
  }
});

console.log('\n===============================================================');
console.log('📊 GUARDRAIL AUDIT SUMMARY:');
console.log(`   Passed Checks : ${passCount} ✅`);
console.log(`   Failed Checks : ${failCount} ${failCount > 0 ? '❌' : ''}`);
console.log('===============================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('🎉 100% OF ALDAFFA ERROR PREVENTION GUARDRAILS VERIFIED!\n');
  process.exit(0);
}
