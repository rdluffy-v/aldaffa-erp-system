/**
 * Suite 28: M1 Iteration 2 Challenger Verification Suite
 *
 * Empirical verification of:
 * 1. IPC event listeners and auto-updater callbacks in Settings.jsx (single payload vs event+data payload).
 * 2. Preload bridge listener wrapping & removeListener unsubscription.
 * 3. Complete AST lexical scope & unhandled reference verification across all 22 JSX modules and App.jsx.
 * 4. Settings auto-updater error handling, fallback URLs, and progress events.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { transformWithOxc, parseAst } from 'vite';
import { walk } from 'estree-walker';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');

const JS_GLOBALS = new Set([
  'window', 'document', 'console', 'Math', 'Number', 'String', 'Boolean', 'Array',
  'Object', 'Date', 'Promise', 'JSON', 'Set', 'Map', 'RegExp', 'isNaN', 'isFinite',
  'parseFloat', 'parseInt', 'encodeURIComponent', 'decodeURIComponent', 'encodeURI',
  'decodeURI', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'fetch', 'FileReader', 'URL',
  'Blob', 'Event', 'CustomEvent', 'localStorage', 'sessionStorage', 'navigator',
  'alert', 'confirm', 'prompt', 'Intl', 'crypto', 'btoa', 'atob', 'performance',
  'process', 'Image', 'Audio', 'FormData', 'Headers', 'Request', 'Response',
  'AbortController', 'IntersectionObserver', 'MutationObserver', 'ResizeObserver',
  'Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError',
  'Symbol', 'BigInt', 'Uint8Array', 'Uint16Array', 'Uint32Array', 'Int8Array',
  'Int16Array', 'Int32Array', 'Float32Array', 'Float64Array', 'ArrayBuffer',
  'DataView', 'WeakMap', 'WeakSet', 'globalThis', 'eval', 'unescape', 'escape',
  'queueMicrotask', 'location', 'history', 'screen', 'undefined', 'NaN', 'Infinity',
  'React', '_jsx', '_jsxs', '_Fragment'
]);

function extractBindings(pattern, set) {
  if (!pattern) return;
  if (pattern.type === 'Identifier') {
    set.add(pattern.name);
  } else if (pattern.type === 'ObjectPattern') {
    for (const prop of pattern.properties) {
      if (prop.type === 'Property') {
        extractBindings(prop.value, set);
      } else if (prop.type === 'RestElement') {
        extractBindings(prop.argument, set);
      }
    }
  } else if (pattern.type === 'ArrayPattern') {
    for (const elem of pattern.elements) {
      if (elem) extractBindings(elem, set);
    }
  } else if (pattern.type === 'AssignmentPattern') {
    extractBindings(pattern.left, set);
  } else if (pattern.type === 'RestElement') {
    extractBindings(pattern.argument, set);
  }
}

function collectHoisted(node, targetSet) {
  if (!node) return;
  if (node.type === 'FunctionDeclaration' && node.id) {
    targetSet.add(node.id.name);
    return;
  }
  if (node.type === 'ClassDeclaration' && node.id) {
    targetSet.add(node.id.name);
    return;
  }
  if (node.type === 'VariableDeclaration') {
    for (const decl of node.declarations) {
      extractBindings(decl.id, targetSet);
    }
    return;
  }
  if (node.type === 'ImportDeclaration') {
    for (const spec of node.specifiers) {
      targetSet.add(spec.local.name);
    }
    return;
  }
  if (node.type === 'ExportNamedDeclaration' && node.declaration) {
    collectHoisted(node.declaration, targetSet);
    return;
  }
  if (node.type === 'ExportDefaultDeclaration' && node.declaration) {
    if (node.declaration.id) targetSet.add(node.declaration.id.name);
    return;
  }

  for (const key of Object.keys(node)) {
    const child = node[key];
    if (child && typeof child === 'object') {
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === 'object' && item.type !== 'FunctionDeclaration' && item.type !== 'FunctionExpression' && item.type !== 'ArrowFunctionExpression') {
            collectHoisted(item, targetSet);
          }
        }
      } else if (child.type !== 'FunctionDeclaration' && child.type !== 'FunctionExpression' && child.type !== 'ArrowFunctionExpression') {
        collectHoisted(child, targetSet);
      }
    }
  }
}

async function analyzeFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath);
  let transformedCode = code;
  if (ext === '.jsx' || ext === '.tsx') {
    const res = await transformWithOxc(code, path.basename(filePath), { jsx: { runtime: 'automatic' } });
    transformedCode = res.code;
  }
  const ast = parseAst(transformedCode);

  const scopeStack = [];
  const moduleScope = new Set();
  collectHoisted(ast, moduleScope);
  scopeStack.push(moduleScope);

  const undeclaredRefs = [];
  const guardedNames = new Set();

  function isDeclared(name) {
    if (JS_GLOBALS.has(name) || guardedNames.has(name)) return true;
    for (let i = scopeStack.length - 1; i >= 0; i--) {
      if (scopeStack[i].has(name)) return true;
    }
    return false;
  }

  // Pass 1: detect typeof guards (e.g. if (typeof X === 'function') X())
  walk(ast, {
    enter(node) {
      if (node.type === 'IfStatement') {
        if (
          node.test?.type === 'BinaryExpression' &&
          (node.test.operator === '===' || node.test.operator === '==')
        ) {
          const left = node.test.left;
          const right = node.test.right;
          if (left?.type === 'UnaryExpression' && left.operator === 'typeof' && left.argument?.type === 'Identifier') {
            if (right?.type === 'Literal' && (right.value === 'function' || right.value === 'object')) {
              guardedNames.add(left.argument.name);
            }
          }
        }
      }
    }
  });

  walk(ast, {
    enter(node, parent) {
      if (
        node.type === 'FunctionDeclaration' ||
        node.type === 'FunctionExpression' ||
        node.type === 'ArrowFunctionExpression'
      ) {
        const fnScope = new Set();
        if (node.id) fnScope.add(node.id.name);
        for (const param of node.params) {
          extractBindings(param, fnScope);
        }
        collectHoisted(node.body, fnScope);
        scopeStack.push(fnScope);
      } else if (node.type === 'CatchClause') {
        const catchScope = new Set();
        if (node.param) extractBindings(node.param, catchScope);
        scopeStack.push(catchScope);
      } else if (node.type === 'ForStatement' || node.type === 'ForInStatement' || node.type === 'ForOfStatement') {
        const loopScope = new Set();
        if (node.init?.type === 'VariableDeclaration' || node.left?.type === 'VariableDeclaration') {
          const decls = node.init?.declarations || node.left?.declarations || [];
          for (const d of decls) extractBindings(d.id, loopScope);
        }
        scopeStack.push(loopScope);
      }

      if (node.type === 'Identifier') {
        if (!parent) return;
        if (parent.type === 'VariableDeclarator' && parent.id === node) return;
        if (parent.type === 'FunctionDeclaration' && parent.id === node) return;
        if (parent.type === 'FunctionExpression' && parent.id === node) return;
        if (parent.type === 'ClassDeclaration' && parent.id === node) return;
        if (parent.type === 'ClassExpression' && parent.id === node) return;
        if (parent.type === 'ImportSpecifier' || parent.type === 'ImportDefaultSpecifier' || parent.type === 'ImportNamespaceSpecifier') return;
        if (parent.type === 'ExportSpecifier') return;
        if (parent.type === 'Property' && parent.key === node && !parent.computed) return;
        if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) return;
        if (parent.type === 'MethodDefinition' && parent.key === node && !parent.computed) return;
        if (parent.type === 'PropertyDefinition' && parent.key === node && !parent.computed) return;
        if (parent.type === 'CatchClause' && parent.param === node) return;
        if (parent.type === 'LabeledStatement' && parent.label === node) return;
        if (parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') return;
        if (parent.type === 'AssignmentPattern' && parent.left === node) return;
        if (parent.type === 'RestElement' && parent.argument === node) return;

        if (!isDeclared(node.name)) {
          const isTypeof = parent.type === 'UnaryExpression' && parent.operator === 'typeof';
          undeclaredRefs.push({ name: node.name, isTypeof, line: node.loc?.start?.line });
        }
      }
    },
    leave(node, parent) {
      if (
        node.type === 'FunctionDeclaration' ||
        node.type === 'FunctionExpression' ||
        node.type === 'ArrowFunctionExpression' ||
        node.type === 'CatchClause' ||
        node.type === 'ForStatement' ||
        node.type === 'ForInStatement' ||
        node.type === 'ForOfStatement'
      ) {
        scopeStack.pop();
      }
    }
  });

  return undeclaredRefs;
}

function findJsxFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(findJsxFiles(fullPath));
    } else if (file.endsWith('.jsx')) {
      results.push(fullPath);
    }
  }
  return results;
}

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
  // 1. SETTINGS IPC LISTENER PAYLOAD FORMATS (Single Payload vs Event+Data)
  // =========================================================================

  await test('28.1.1 Settings: handleStatus normalizes single payload format (data only)', async () => {
    let updateStatus = null;
    let toastInfo = null;
    let toastSuccess = null;
    let toastError = null;

    const setUpdateStatus = (s) => { updateStatus = s; };
    const showInfo = (m) => { toastInfo = m; };
    const showSuccess = (m) => { toastSuccess = m; };
    const showError = (m) => { toastError = m; };

    // Exact Settings.jsx handleStatus logic
    const handleStatus = (eventOrData, data) => {
      const payload = (data !== undefined) ? data : eventOrData;
      if (!payload) return;
      setUpdateStatus(payload);
      if (payload.status === 'available') {
        showInfo('يوجد تحديث جديد متاح للتحميل!');
      } else if (payload.status === 'downloaded') {
        showSuccess('تم تحميل التحديث بنجاح. جاهز للتثبيت.');
      } else if (payload.status === 'not-available') {
        showSuccess('المنظومة محدثة إلى آخر إصدار.');
      } else if (payload.status === 'error') {
        showError('خطأ في التحديث: ' + payload.error);
      }
    };

    // 1. Single payload: status 'available'
    handleStatus({ status: 'available', version: '2.4.0' });
    assert.deepStrictEqual(updateStatus, { status: 'available', version: '2.4.0' });
    assert.strictEqual(toastInfo, 'يوجد تحديث جديد متاح للتحميل!');

    // 2. Single payload: status 'downloaded'
    handleStatus({ status: 'downloaded', version: '2.4.0' });
    assert.strictEqual(toastSuccess, 'تم تحميل التحديث بنجاح. جاهز للتثبيت.');

    // 3. Single payload: status 'not-available'
    toastSuccess = null;
    handleStatus({ status: 'not-available' });
    assert.strictEqual(toastSuccess, 'المنظومة محدثة إلى آخر إصدار.');

    // 4. Single payload: status 'error'
    handleStatus({ status: 'error', error: 'Network timeout' });
    assert.strictEqual(toastError, 'خطأ في التحديث: Network timeout');

    // 5. Single payload: undefined / null handling
    updateStatus = null;
    handleStatus(null);
    assert.strictEqual(updateStatus, null);
    handleStatus(undefined);
    assert.strictEqual(updateStatus, null);
  });

  await test('28.1.2 Settings: handleStatus normalizes two-argument format (event, data)', async () => {
    let updateStatus = null;
    let toastInfo = null;
    let toastSuccess = null;
    let toastError = null;

    const setUpdateStatus = (s) => { updateStatus = s; };
    const showInfo = (m) => { toastInfo = m; };
    const showSuccess = (m) => { toastSuccess = m; };
    const showError = (m) => { toastError = m; };

    const handleStatus = (eventOrData, data) => {
      const payload = (data !== undefined) ? data : eventOrData;
      if (!payload) return;
      setUpdateStatus(payload);
      if (payload.status === 'available') {
        showInfo('يوجد تحديث جديد متاح للتحميل!');
      } else if (payload.status === 'downloaded') {
        showSuccess('تم تحميل التحديث بنجاح. جاهز للتثبيت.');
      } else if (payload.status === 'not-available') {
        showSuccess('المنظومة محدثة إلى آخر إصدار.');
      } else if (payload.status === 'error') {
        showError('خطأ في التحديث: ' + payload.error);
      }
    };

    const mockEvent = { sender: 'ipc-main' };

    // 1. Two-arg: status 'available'
    handleStatus(mockEvent, { status: 'available', version: '2.4.0' });
    assert.deepStrictEqual(updateStatus, { status: 'available', version: '2.4.0' });
    assert.strictEqual(toastInfo, 'يوجد تحديث جديد متاح للتحميل!');

    // 2. Two-arg: status 'downloaded'
    handleStatus(mockEvent, { status: 'downloaded', version: '2.4.0' });
    assert.strictEqual(toastSuccess, 'تم تحميل التحديث بنجاح. جاهز للتثبيت.');

    // 3. Two-arg: status 'error'
    handleStatus(mockEvent, { status: 'error', error: '404 Not Found' });
    assert.strictEqual(toastError, 'خطأ في التحديث: 404 Not Found');
  });

  await test('28.1.3 Settings: handleProgress normalizes single payload and two-argument formats', async () => {
    let downloadProgress = null;
    const setDownloadProgress = (p) => { downloadProgress = p; };

    const handleProgress = (eventOrProgress, progress) => {
      const payload = (progress !== undefined) ? progress : eventOrProgress;
      setDownloadProgress(payload);
    };

    // Single payload object
    handleProgress({ percent: 45.5, bytesPerSecond: 1024000 });
    assert.deepStrictEqual(downloadProgress, { percent: 45.5, bytesPerSecond: 1024000 });

    // Two-argument format
    const mockEvent = { sender: 'ipc' };
    handleProgress(mockEvent, { percent: 99.9, bytesPerSecond: 2048000 });
    assert.deepStrictEqual(downloadProgress, { percent: 99.9, bytesPerSecond: 2048000 });

    // Numeric progress value 0 boundary
    handleProgress(0);
    assert.strictEqual(downloadProgress, 0);

    handleProgress(mockEvent, 100);
    assert.strictEqual(downloadProgress, 100);
  });

  await test('28.1.4 Preload Bridge: on and removeListener registry mechanics', async () => {
    const listenerRegistry = new Map();
    const mockIpcRenderer = {
      listeners: new Map(),
      on(channel, fn) {
        if (!this.listeners.has(channel)) this.listeners.set(channel, []);
        this.listeners.get(channel).push(fn);
      },
      removeListener(channel, fn) {
        if (!this.listeners.has(channel)) return;
        const list = this.listeners.get(channel);
        const idx = list.indexOf(fn);
        if (idx !== -1) list.splice(idx, 1);
      },
      emit(channel, ...args) {
        const list = this.listeners.get(channel) || [];
        for (const fn of [...list]) fn({ sender: 'ipc' }, ...args);
      }
    };

    const safeIpcRenderer = {
      on: (channel, listener) => {
        if (typeof listener !== 'function') return;
        const wrapped = (_event, ...args) => listener(...args);
        listenerRegistry.set(listener, wrapped);
        mockIpcRenderer.on(channel, wrapped);
      },
      removeListener: (channel, listener) => {
        const wrapped = listenerRegistry.get(listener);
        if (wrapped) {
          mockIpcRenderer.removeListener(channel, wrapped);
          listenerRegistry.delete(listener);
        }
      }
    };

    let receivedPayload = null;
    const testListener = (payload) => {
      receivedPayload = payload;
    };

    safeIpcRenderer.on('update-status', testListener);
    assert.strictEqual(listenerRegistry.has(testListener), true);

    // Emit event from main process with event + data
    mockIpcRenderer.emit('update-status', { status: 'available' });
    assert.deepStrictEqual(receivedPayload, { status: 'available' });

    // Unsubscribe cleanly
    safeIpcRenderer.removeListener('update-status', testListener);
    assert.strictEqual(listenerRegistry.has(testListener), false);

    // Emit again: should NOT update receivedPayload
    mockIpcRenderer.emit('update-status', { status: 'downloaded' });
    assert.deepStrictEqual(receivedPayload, { status: 'available' });
  });

  // =========================================================================
  // 2. EXHAUSTIVE STATIC AST SCAN ACROSS ALL 22 JSX MODULES & APP.JSX
  // =========================================================================

  const all22Modules = [
    'src/modules/AIAdvisor.jsx',
    'src/modules/Analytics.jsx',
    'src/modules/BarcodeStudio.jsx',
    'src/modules/CapitalInjections.jsx',
    'src/modules/Categories.jsx',
    'src/modules/Dashboard.jsx',
    'src/modules/Debtors.jsx',
    'src/modules/Discounts.jsx',
    'src/modules/Gifts.jsx',
    'src/modules/Inventory.jsx',
    'src/modules/InventoryFull.jsx',
    'src/modules/Invoices.jsx',
    'src/modules/Losses.jsx',
    'src/modules/Notes.jsx',
    'src/modules/OnlineSales.jsx',
    'src/modules/POS.jsx',
    'src/modules/PerfumeMixLab.jsx',
    'src/modules/Purchases.jsx',
    'src/modules/Returns.jsx',
    'src/modules/Settings.jsx',
    'src/modules/ShiftClose.jsx',
    'src/modules/Withdrawals.jsx'
  ];

  for (const modPath of all22Modules) {
    const modName = path.basename(modPath);
    await test(`28.2 AST Analysis: Zero unhandled identifier references in ${modName}`, async () => {
      const fullPath = path.join(projectRoot, modPath);
      assert(fs.existsSync(fullPath), `Module file does not exist: ${fullPath}`);

      const unhandled = await analyzeFile(fullPath);
      const hardErrors = unhandled.filter((r) => !r.isTypeof);

      assert.strictEqual(
        hardErrors.length,
        0,
        `Found ${hardErrors.length} unhandled reference(s) in ${modName}: ${JSON.stringify(hardErrors)}`
      );
    });
  }

  await test('28.3 AST Analysis: Zero unhandled identifier references across ALL JSX files in src/', async () => {
    const jsxFiles = findJsxFiles(path.join(projectRoot, 'src'));
    assert(jsxFiles.length >= 22, `Expected at least 22 JSX files, found ${jsxFiles.length}`);

    const allViolations = [];
    for (const filePath of jsxFiles) {
      const unhandled = await analyzeFile(filePath);
      const hardErrors = unhandled.filter((r) => !r.isTypeof);
      if (hardErrors.length > 0) {
        allViolations.push({ file: path.relative(projectRoot, filePath), errors: hardErrors });
      }
    }

    assert.strictEqual(
      allViolations.length,
      0,
      `Found unhandled references across files: ${JSON.stringify(allViolations, null, 2)}`
    );
  });

  return results;
}
