const assert = require('assert');
const { evaluateRegion } = require('../../src/engine/evaluators/region');

console.log('--- RUNNING REGION UNIT TESTS ---');

const gyandhanCriteria = {
  rejected_regions: [
    { state: 'Jammu & Kashmir' },
    { state: 'Assam', exceptions: ['Guwahati'] }
  ]
};

// Test 1: Unrestricted state -> PASS
const r1 = evaluateRegion({ state: 'Karnataka', city: 'Bengaluru' }, gyandhanCriteria);
assert.strictEqual(r1.status, 'PASS', 'Karnataka should PASS');

// Test 2: Restricted state without exception -> FAIL
const r2 = evaluateRegion({ state: 'Jammu & Kashmir', city: 'Srinagar' }, gyandhanCriteria);
assert.strictEqual(r2.status, 'FAIL', 'Jammu & Kashmir should FAIL');
assert.strictEqual(r2.reason_code, 'REGION_RESTRICTED');

// Test 3: Restricted state WITH city exception applied -> PASS
const r3 = evaluateRegion({ state: 'Assam', city: 'Guwahati' }, gyandhanCriteria);
assert.strictEqual(r3.status, 'PASS', 'Assam - Guwahati must PASS under city exception');
assert.strictEqual(r3.exception_applied, true);

// Test 4: Restricted state WITHOUT city exception -> FAIL
const r4 = evaluateRegion({ state: 'Assam', city: 'Silchar' }, gyandhanCriteria);
assert.strictEqual(r4.status, 'FAIL', 'Assam - Silchar must FAIL');

// Test 5: Restricted state with city missing -> UNKNOWN
const r5 = evaluateRegion({ state: 'Assam', city: '' }, gyandhanCriteria);
assert.strictEqual(r5.status, 'UNKNOWN', 'Assam with blank city must return UNKNOWN');
assert.strictEqual(r5.reason_code, 'CITY_VERIFICATION_REQUIRED');

// Test 6: Missing state when lender has restrictions -> UNKNOWN
const r6 = evaluateRegion({ state: '', city: '' }, gyandhanCriteria);
assert.strictEqual(r6.status, 'UNKNOWN', 'Missing state must return UNKNOWN when lender has restricted regions');
assert.strictEqual(r6.reason_code, 'APPLICANT_STATE_MISSING');

// Test 7: Missing state when lender has NO restrictions (e.g. Fibe) -> PASS
const r7 = evaluateRegion({ state: '', city: '' }, { rejected_regions: [] });
assert.strictEqual(r7.status, 'PASS', 'Missing state should PASS if lender has no regional restrictions');

console.log('✓ All 7 Region unit tests passed successfully.');
