const assert = require('assert');
const { evaluateCibil } = require('../../src/engine/evaluators/cibil');

console.log('--- RUNNING CIBIL UNIT TESTS ---');

// Test 1: Exact score >= threshold -> PASS
const r1 = evaluateCibil({ exact_score: 750 }, { cibil_min: 651 });
assert.strictEqual(r1.status, 'PASS', '750 should PASS for threshold 651');

// Test 2: Exact score < threshold -> FAIL
const r2 = evaluateCibil({ exact_score: 640 }, { cibil_min: 651 });
assert.strictEqual(r2.status, 'FAIL', '640 should FAIL for threshold 651');
assert.strictEqual(r2.reason_code, 'CIBIL_BELOW_MINIMUM');

// Test 3: Range 700-900 for threshold 651 -> PASS (entire range >= 651)
const r3 = evaluateCibil({ range_string: '700 - 900' }, { cibil_min: 651 });
assert.strictEqual(r3.status, 'PASS', '700-900 should PASS for threshold 651');

// Test 4: Range 700-900 for threshold 711 (Gyandhan) -> UNKNOWN (straddles 711)
const r4 = evaluateCibil({ range_string: '700 - 900' }, { cibil_min: 711 });
assert.strictEqual(r4.status, 'UNKNOWN', '700-900 should be UNKNOWN for threshold 711');
assert.strictEqual(r4.reason_code, 'NEEDS_EXACT_CIBIL_SCORE');

// Test 5: Range 700-900 for threshold 721 (Bajaj) -> UNKNOWN (straddles 721)
const r5 = evaluateCibil({ range_string: '700 - 900' }, { cibil_min: 721 });
assert.strictEqual(r5.status, 'UNKNOWN', '700-900 should be UNKNOWN for threshold 721');

// Test 6: Range 300-649 for threshold 651 -> FAIL (entire range < 651)
const r6 = evaluateCibil({ range_string: '300 - 649' }, { cibil_min: 651 });
assert.strictEqual(r6.status, 'FAIL', '300-649 should FAIL for threshold 651');
assert.strictEqual(r6.reason_code, 'CIBIL_RANGE_BELOW_MINIMUM');

// Test 7: Range 650-699 for threshold 651 -> UNKNOWN (lower bound 650 < 651 <= 699)
const r7 = evaluateCibil({ range_string: '650 - 699' }, { cibil_min: 651 });
assert.strictEqual(r7.status, 'UNKNOWN', '650-699 should be UNKNOWN for threshold 651');

// Test 8: No CIBIL Score without NTC policy -> UNKNOWN
const r8 = evaluateCibil({ range_string: 'No CIBIL Score' }, { cibil_min: 651 });
assert.strictEqual(r8.status, 'UNKNOWN', 'No CIBIL Score should be UNKNOWN without explicit policy');
assert.strictEqual(r8.reason_code, 'EXACT_BUREAU_REQUIRED_NTC');

// Test 9: No CIBIL Score with NTC rejected policy -> FAIL
const r9 = evaluateCibil({ range_string: 'No CIBIL Score' }, { cibil_min: 651 }, { allows_ntc: false });
assert.strictEqual(r9.status, 'FAIL', 'No CIBIL Score should FAIL when NTC is prohibited');
assert.strictEqual(r9.reason_code, 'NTC_NOT_ACCEPTED');

// Test 10: Missing/Empty CIBIL -> UNKNOWN
const r10 = evaluateCibil({}, { cibil_min: 651 });
assert.strictEqual(r10.status, 'UNKNOWN', 'Empty CIBIL should be UNKNOWN');

// Test 11: Out of range CIBIL (e.g. 250 or 950) -> FAIL
const r11 = evaluateCibil({ exact_score: 950 }, { cibil_min: 651 });
assert.strictEqual(r11.status, 'FAIL', 'Score 950 is invalid and must FAIL');

console.log('✓ All 11 CIBIL unit tests passed successfully.');
