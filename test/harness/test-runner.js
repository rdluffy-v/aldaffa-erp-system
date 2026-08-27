/**
 * Automated Multi-Agent QA & Test Runner
 * Discovers and executes all test suites in test/suites/
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTestSuite() {
  console.log('\n===============================================================');
  console.log('🧪 ALDAFFA PERFUMES ERP — AUTOMATED QA & VERIFICATION SUITE');
  console.log('===============================================================\n');

  const suitesDir = path.join(__dirname, '..', 'suites');
  if (!fs.existsSync(suitesDir)) {
    console.error(`❌ Suites directory not found: ${suitesDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(suitesDir).filter((f) => f.endsWith('.test.js')).sort();

  let totalSuites = 0;
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  const startTime = Date.now();

  for (const file of files) {
    totalSuites++;
    const suitePath = path.join(suitesDir, file);
    console.log(`\n📦 Running Suite: ${file}`);
    console.log('---------------------------------------------------------------');

    try {
      const suite = await import(`file://${suitePath}`);
      if (typeof suite.run === 'function') {
        const results = await suite.run();
        for (const res of results) {
          totalTests++;
          if (res.passed) {
            passedTests++;
            console.log(`  ✅ [PASS] ${res.name} (${res.duration}ms)`);
          } else {
            failedTests++;
            console.log(`  ❌ [FAIL] ${res.name} (${res.duration}ms)`);
            console.log(`     Error: ${res.error?.message || res.error}`);
            if (res.error?.stack) {
              console.log(`     Stack: ${res.error.stack.split('\n').slice(1, 3).join('\n')}`);
            }
          }
        }
      } else {
        console.warn(`  ⚠️ Suite ${file} does not export a run() function`);
      }
    } catch (err) {
      console.error(`  💥 Fatal Suite Error in ${file}:`, err);
      failedTests++;
      totalTests++;
    }
  }

  const totalDuration = Date.now() - startTime;

  console.log('\n===============================================================');
  console.log('📊 TEST EXECUTION SUMMARY:');
  console.log(`   Suites Executed : ${totalSuites}`);
  console.log(`   Total Tests     : ${totalTests}`);
  console.log(`   Passed          : ${passedTests} ✅`);
  console.log(`   Failed          : ${failedTests} ${failedTests > 0 ? '❌' : ''}`);
  console.log(`   Total Time      : ${totalDuration}ms`);
  console.log('===============================================================\n');

  if (failedTests > 0) {
    console.error(`❌ Test run completed with ${failedTests} failure(s).`);
    process.exit(1);
  } else {
    console.log('🎉 ALL AUTOMATED QA TESTS PASSED SUCCESSFULLY (100%)!\n');
    process.exit(0);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
