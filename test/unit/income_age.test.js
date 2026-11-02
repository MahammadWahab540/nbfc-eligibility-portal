const assert = require('assert');
const { evaluateIncome, evaluateAge } = require('../../src/engine/evaluators/income_age');

console.log('--- RUNNING INCOME & AGE UNIT TESTS ---');

const criteria = {
  monthly_income_min: 25000,
  age_min: 21,
  age_max: 58
};

// 1. Income Tests
// Missing income -> UNKNOWN (never assume 0)
const i1 = evaluateIncome(null, criteria);
assert.strictEqual(i1.status, 'UNKNOWN', 'Missing income must be UNKNOWN');
assert.strictEqual(i1.reason_code, 'INCOME_MISSING');

// Income < min -> FAIL
const i2 = evaluateIncome(20000, criteria);
assert.strictEqual(i2.status, 'FAIL', '20k income must FAIL for 25k threshold');
assert.strictEqual(i2.reason_code, 'MINIMUM_INCOME_NOT_MET');

// Income == min -> PASS
const i3 = evaluateIncome(25000, criteria);
assert.strictEqual(i3.status, 'PASS', '25k income must PASS');

// Income > min -> PASS
const i4 = evaluateIncome(60000, criteria);
assert.strictEqual(i4.status, 'PASS', '60k income must PASS');

// 2. Age Tests
// Missing age -> UNKNOWN (never assume 0)
const a1 = evaluateAge(null, criteria);
assert.strictEqual(a1.status, 'UNKNOWN', 'Missing age must be UNKNOWN');
assert.strictEqual(a1.reason_code, 'AGE_MISSING');

// Underage < 21 -> FAIL
const a2 = evaluateAge(18, criteria);
assert.strictEqual(a2.status, 'FAIL', 'Age 18 must FAIL (underage)');
assert.strictEqual(a2.reason_code, 'COAPPLICANT_UNDERAGE');

// Boundary: Age 21 -> PASS
const a3 = evaluateAge(21, criteria);
assert.strictEqual(a3.status, 'PASS', 'Age 21 must PASS');

// Boundary: Age 58 -> PASS
const a4 = evaluateAge(58, criteria);
assert.strictEqual(a4.status, 'PASS', 'Age 58 must PASS');

// Age > max (59) -> FAIL
const a5 = evaluateAge(59, criteria);
assert.strictEqual(a5.status, 'FAIL', 'Age 59 must FAIL for max 58');
assert.strictEqual(a5.reason_code, 'AGE_EXCEEDS_MAX_LIMIT');

console.log('✓ All 9 Income and Age unit tests passed successfully.');
