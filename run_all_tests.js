const { execSync } = require('child_process');

const testSuites = [
  'test/unit/cibil.test.js',
  'test/unit/relationship.test.js',
  'test/unit/bank.test.js',
  'test/unit/income_age.test.js',
  'test/unit/region.test.js',
  'test/unit/identity.test.js',
  'test/unit/reconciliation.test.js',
  'test/unit/v2_3_enhancements.test.js',
  'test/unit/payload_manager.test.js',
  'test/boundary/thresholds.test.js',
  'test/synthetic/edge_cases_100.test.js',
  'test/integration/salesforce_sync.test.js',
  'test/regression/contradictions_audit.test.js',
  'test-scenarios.js',
  'test/replay/historical_replay.js'
];

console.log('================================================================');
console.log('         NBFC ELIGIBILITY ENGINE AUTOMATED TEST SUITE           ');
console.log('================================================================');

let passedCount = 0;
let failedCount = 0;

testSuites.forEach((suite, idx) => {
  console.log(`\n[${idx + 1}/${testSuites.length}] Running ${suite}...`);
  try {
    const output = execSync(`node ${suite}`, { encoding: 'utf8' });
    console.log(output.trim());
    passedCount++;
  } catch (err) {
    console.error(`❌ Suite ${suite} FAILED:`, err.stdout || err.message);
    failedCount++;
  }
});

console.log('\n================================================================');
console.log(`TOTAL SUITES: ${testSuites.length} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
console.log('================================================================');

if (failedCount > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL TEST SUITES PASSED CLEANLY WITH ZERO DEFECTS.');
}
