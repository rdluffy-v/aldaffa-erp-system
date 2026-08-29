import fs from 'fs';
import path from 'path';
import assert from 'assert';

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

  function findSourceFiles(dir, exts = ['.jsx', '.js']) {
    let listFiles = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        if (file !== 'node_modules' && file !== 'dist' && file !== '.git') {
          listFiles = listFiles.concat(findSourceFiles(filePath, exts));
        }
      } else if (exts.includes(path.extname(file))) {
        listFiles.push(filePath);
      }
    }
    return listFiles;
  }

  const hooks = ['useState', 'useEffect', 'useCallback', 'useMemo', 'useRef', 'useContext', 'useReducer'];
  const files = findSourceFiles(path.resolve(process.cwd(), 'src'));

  await test('14.1 Zero Missing React Hook Imports Across All Modules', async () => {
    const missingImports = [];

    for (const file of files) {
      const rawContent = fs.readFileSync(file, 'utf8');
      // Strip comments
      const content = rawContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
      
      // Extract all imports from 'react'
      const reactImportRegex = /import\s+(?:React\s*,\s*)?\{([^}]+)\}\s+from\s+['"]react['"]/gs;
      const importedHooks = new Set();
      let importMatch;
      while ((importMatch = reactImportRegex.exec(content)) !== null) {
        const namedList = importMatch[1].split(',').map(s => s.trim());
        for (const named of namedList) {
          importedHooks.add(named);
        }
      }

      for (const hook of hooks) {
        const hookCallRegex = new RegExp(`\\b${hook}\\s*\\(`, 'g');
        if (hookCallRegex.test(content)) {
          const hasNamedImport = importedHooks.has(hook);
          const hasReactDotCall = new RegExp(`React\\.${hook}\\s*\\(`).test(content);
          const isLocalVar = content.includes(`const ${hook} =`) || content.includes(`let ${hook} =`);

          if (!hasNamedImport && !hasReactDotCall && !isLocalVar) {
            missingImports.push({ file: path.relative(process.cwd(), file), hook });
          }
        }
      }
    }

    assert.strictEqual(
      missingImports.length,
      0,
      `Detected missing React hook imports: ${JSON.stringify(missingImports, null, 2)}`
    );
  });

  await test('14.2 All IPC Renderer Calls Match Valid Main Channels', async () => {
    const mainContent = fs.readFileSync(path.resolve(process.cwd(), 'main.cjs'), 'utf8');
    const registeredChannels = new Set();
    const ipcHandleRegex = /ipcMain\.handle\(\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = ipcHandleRegex.exec(mainContent)) !== null) {
      registeredChannels.add(match[1]);
    }

    const unregisteredCalls = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const invokeRegex = /(?:ipcRenderer\.invoke|invokeIpc)\(\s*['"]([^'"]+)['"]/g;
      let callMatch;
      while ((callMatch = invokeRegex.exec(content)) !== null) {
        const channel = callMatch[1];
        if (!registeredChannels.has(channel)) {
          unregisteredCalls.push({ file: path.relative(process.cwd(), file), channel });
        }
      }
    }

    assert.strictEqual(
      unregisteredCalls.length,
      0,
      `Detected unregistered IPC calls in frontend: ${JSON.stringify(unregisteredCalls, null, 2)}`
    );
  });

  return results;
}
