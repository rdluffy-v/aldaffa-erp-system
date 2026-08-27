/**
 * Verification & Stress Test Executor for Challenger 1
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runAllChallengerTests() {
  const suitesDir = path.join(__dirname, '../../test/suites');
  const files = fs.readdirSync(suitesDir).filter((f) => f.endsWith('.test.js')).sort();

  console.log('🧪 Starting Empirical Stress & Verification Testing Suite');
  console.log(`Found ${files.length} test suites.`);

  const summary = {
    totalSuites: files.length,
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    suiteResults: []
  };

  const startTime = Date.now();

  for (const file of files) {
    const suitePath = path.join(suitesDir, file);
    const suiteStart = Date.now();
    try {
      const suite = await import(`file://${suitePath}`);
      if (typeof suite.run === 'function') {
        const results = await suite.run();
        const suiteRes = {
          file,
          duration: Date.now() - suiteStart,
          tests: results
        };
        for (const r of results) {
          summary.totalTests++;
          if (r.passed) {
            summary.passedTests++;
          } else {
            summary.failedTests++;
          }
        }
        summary.suiteResults.push(suiteRes);
      }
    } catch (err) {
      summary.failedTests++;
      summary.totalTests++;
      summary.suiteResults.push({
        file,
        duration: Date.now() - suiteStart,
        error: err.message,
        tests: [{ name: file, passed: false, error: err.message }]
      });
    }
  }

  summary.totalDuration = Date.now() - startTime;

  fs.writeFileSync(
    path.join(__dirname, 'test_results.json'),
    JSON.stringify(summary, null, 2)
  );

  console.log(`✅ Execution complete: ${summary.passedTests}/${summary.totalTests} passed in ${summary.totalDuration}ms`);
  return summary;
}

runAllChallengerTests().catch(console.error);
