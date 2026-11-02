const assert = require('assert');
const { classifyBank } = require('../../src/config/bank_registry');
const { evaluateBank } = require('../../src/engine/evaluators/bank');

console.log('--- RUNNING BANK CLASSIFICATION UNIT TESTS ---');

// Strict PSU-only criteria (Private not accepted)
const psuOnlyCriteria = {
  non_nationalised_bank_accepted: false,
  private_bank_accepted: false,
  cooperative_bank_accepted: false
};

// Bajaj Finserv v2.2 Criteria (Accepts PSU + Private + RRB, rejects Co-operative)
const bajajCriteria = {
  non_nationalised_bank_accepted: false,
  private_bank_accepted: true,
  cooperative_bank_accepted: false,
  rrb_accepted: true
};

// Open Digital lender (Fibe)
const fibeCriteria = {
  non_nationalised_bank_accepted: true,
  private_bank_accepted: true,
  cooperative_bank_accepted: true,
  rrb_accepted: true
};

// Test 1: SBIN (State Bank of India) -> PASS for all
const b1 = classifyBank('SBIN');
assert.strictEqual(b1.category, 'PUBLIC_SECTOR');
assert.strictEqual(b1.is_nationalised, true);
const r1 = evaluateBank(b1, psuOnlyCriteria);
assert.strictEqual(r1.status, 'PASS', 'SBIN must PASS for PSU criteria');

// Test 2: CNRB (Canara Bank) -> PASS for Bajaj
const b2 = classifyBank('CNRB');
assert.strictEqual(b2.category, 'PUBLIC_SECTOR');
const r2 = evaluateBank(b2, bajajCriteria);
assert.strictEqual(r2.status, 'PASS', 'CNRB must PASS for Bajaj');

// Test 3: HDFC Bank -> FAIL for psuOnly, PASS for Bajaj v2.2 & Fibe
const b3 = classifyBank('HDFC');
assert.strictEqual(b3.category, 'PRIVATE_SECTOR');
const r3Strict = evaluateBank(b3, psuOnlyCriteria);
assert.strictEqual(r3Strict.status, 'FAIL', 'HDFC must FAIL for strict PSU-only criteria');

const r3Bajaj = evaluateBank(b3, bajajCriteria);
assert.strictEqual(r3Bajaj.status, 'PASS', 'HDFC must PASS for Bajaj under approved private bank policy');

const r3Fibe = evaluateBank(b3, fibeCriteria);
assert.strictEqual(r3Fibe.status, 'PASS', 'HDFC must PASS for Fibe');

// Test 4: Co-operative Bank (NCBL) -> FAIL for Bajaj, PASS for Fibe
const b4 = classifyBank('NCBL');
assert.strictEqual(b4.category, 'COOPERATIVE');
const r4 = evaluateBank(b4, bajajCriteria);
assert.strictEqual(r4.status, 'FAIL', 'Co-operative bank must FAIL for Bajaj');
assert.strictEqual(r4.reason_code, 'COOPERATIVE_BANK_NOT_ACCEPTED');

// Test 5: KVGB (Regional Rural Bank) -> PASS for Bajaj via UPI mandate
const b5 = classifyBank('KVGB');
assert.strictEqual(b5.category, 'REGIONAL_RURAL');
const r5 = evaluateBank(b5, bajajCriteria);
assert.strictEqual(r5.status, 'PASS', 'KVGB must PASS for Bajaj via UPI mandate');

// Test 6: Missing / Blank Bank -> UNKNOWN for Bajaj
const b6 = classifyBank('');
const r6 = evaluateBank(b6, bajajCriteria);
assert.strictEqual(r6.status, 'UNKNOWN', 'Blank bank must return UNKNOWN for Bajaj');
assert.strictEqual(r6.reason_code, 'BANK_VERIFICATION_REQUIRED');

// Test 7: "OTHER" bank -> UNKNOWN (verification required) for Bajaj, PASS for Fibe
const b7 = classifyBank('OTHER');
const r7 = evaluateBank(b7, bajajCriteria);
assert.strictEqual(r7.status, 'UNKNOWN', 'OTHER bank must return UNKNOWN (verification required) for Bajaj');

console.log('✓ All 7 Bank unit tests passed successfully.');
