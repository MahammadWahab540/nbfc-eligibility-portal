const assert = require('assert');
const { evaluateIncome, evaluateAge } = require('../../src/engine/evaluators/income_age');

console.log('--- RUNNING INCOME & AGE UNIT TESTS ---');

const strictCriteria = {
  monthly_income_min: 25000,
  age_min: 21,
  age_max: 58
};

const tieredCriteria = {
  monthly_income_min: 25000,
  monthly_income_hard_min: 15000,
  age_min: 21,
  age_max: 58,
  age_max_with_exception: 65
};

// 1. Strict Criteria Income Tests
// Missing income -> UNKNOWN (never assume 0)
const i1 = evaluateIncome(null, strictCriteria);
assert.strictEqual(i1.status, 'UNKNOWN', 'Missing income must be UNKNOWN');
assert.strictEqual(i1.reason_code, 'INCOME_MISSING');

// Income < min -> FAIL
const i2 = evaluateIncome(14000, strictCriteria);
assert.strictEqual(i2.status, 'FAIL', '14k income must FAIL for 25k strict threshold');
assert.strictEqual(i2.reason_code, 'MINIMUM_INCOME_NOT_MET');

// Income == min -> PASS
const i3 = evaluateIncome(25000, strictCriteria);
assert.strictEqual(i3.status, 'PASS', '25k income must PASS');

// Income > min -> PASS
const i4 = evaluateIncome(60000, strictCriteria);
assert.strictEqual(i4.status, 'PASS', '60k income must PASS');

// 2. Tiered Criteria Income Tests
// Income < hardMin (14,999) -> FAIL
const i5 = evaluateIncome(14999, tieredCriteria);
assert.strictEqual(i5.status, 'FAIL', '14,999 must FAIL for 15,000 hard minimum');

// Income in conditional band (20,000) -> UNKNOWN (requires income verification, does not hard reject)
const i6 = evaluateIncome(20000, tieredCriteria);
assert.strictEqual(i6.status, 'UNKNOWN', '20,000 in conditional band must return UNKNOWN');
assert.strictEqual(i6.reason_code, 'INCOME_VERIFICATION_REQUIRED');

// Income at prime threshold (25,000) -> PASS
const i7 = evaluateIncome(25000, tieredCriteria);
assert.strictEqual(i7.status, 'PASS', '25,000 must PASS prime threshold');

// 3. Age Tests
// Missing age -> UNKNOWN (never assume 0)
const a1 = evaluateAge(null, strictCriteria);
assert.strictEqual(a1.status, 'UNKNOWN', 'Missing age must be UNKNOWN');
assert.strictEqual(a1.reason_code, 'AGE_MISSING');

// Underage < 21 -> FAIL
const a2 = evaluateAge(18, strictCriteria);
assert.strictEqual(a2.status, 'FAIL', 'Age 18 must FAIL (underage)');
assert.strictEqual(a2.reason_code, 'COAPPLICANT_UNDERAGE');

// Boundary: Age 21 -> PASS
const a3 = evaluateAge(21, strictCriteria);
assert.strictEqual(a3.status, 'PASS', 'Age 21 must PASS');

// Boundary: Age 58 -> PASS
const a4 = evaluateAge(58, strictCriteria);
assert.strictEqual(a4.status, 'PASS', 'Age 58 must PASS');

// Strict: Age 59 -> FAIL
const a5 = evaluateAge(59, strictCriteria);
assert.strictEqual(a5.status, 'FAIL', 'Age 59 must FAIL for strict max 58');

// Tiered: Age 60-62 -> UNKNOWN (permissible under senior co-applicant exception)
const a6 = evaluateAge(60, tieredCriteria);
assert.strictEqual(a6.status, 'UNKNOWN', 'Age 60 in senior exception band must return UNKNOWN');
assert.strictEqual(a6.reason_code, 'SENIOR_COAPPLICANT_REVIEW');

const a7 = evaluateAge(65, tieredCriteria);
assert.strictEqual(a7.status, 'UNKNOWN', 'Age 65 at senior exception boundary must return UNKNOWN');

// Tiered: Age 66 > maxSeniorException -> FAIL
const a8 = evaluateAge(66, tieredCriteria);
assert.strictEqual(a8.status, 'FAIL', 'Age 66 must FAIL exceeding senior limit 65');

console.log('✓ All 15 Income and Age unit tests passed successfully.');
