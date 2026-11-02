const assert = require('assert');
const { classifyBank } = require('../../src/config/bank_registry');
const { evaluateBank } = require('../../src/engine/evaluators/bank');

console.log('--- RUNNING BANK CLASSIFICATION UNIT TESTS ---');

// Auxilo requires nationalised / PSU bank
const auxiloCriteria = { non_nationalised_bank_accepted: false };
// Fibe accepts non-nationalised bank
const fibeCriteria = { non_nationalised_bank_accepted: true };

// Test 1: SBIN (State Bank of India) -> PASS for Auxilo
const b1 = classifyBank('SBIN');
assert.strictEqual(b1.category, 'PUBLIC_SECTOR');
assert.strictEqual(b1.is_nationalised, true);
const r1 = evaluateBank(b1, auxiloCriteria);
assert.strictEqual(r1.status, 'PASS', 'SBIN must PASS for Auxilo');

// Test 2: CNRB (Canara Bank) -> PASS for Auxilo
const b2 = classifyBank('CNRB');
assert.strictEqual(b2.category, 'PUBLIC_SECTOR');
const r2 = evaluateBank(b2, auxiloCriteria);
assert.strictEqual(r2.status, 'PASS', 'CNRB must PASS for Auxilo');

// Test 3: HDFC Bank -> FAIL for Auxilo (Private Sector), PASS for Fibe
const b3 = classifyBank('HDFC');
assert.strictEqual(b3.category, 'PRIVATE_SECTOR');
const r3 = evaluateBank(b3, auxiloCriteria);
assert.strictEqual(r3.status, 'FAIL', 'HDFC must FAIL for Auxilo (non-nationalised not accepted)');
const r3f = evaluateBank(b3, fibeCriteria);
assert.strictEqual(r3f.status, 'PASS', 'HDFC must PASS for Fibe');

// Test 4: KVGB (Grameena Bank) -> FAIL for Auxilo, PASS for Fibe
const b4 = classifyBank('KVGB');
assert.strictEqual(b4.category, 'REGIONAL_RURAL');
const r4 = evaluateBank(b4, auxiloCriteria);
assert.strictEqual(r4.status, 'FAIL', 'KVGB must FAIL for Auxilo');

// Test 5: Missing / Blank Bank -> UNKNOWN for Auxilo
const b5 = classifyBank('');
const r5 = evaluateBank(b5, auxiloCriteria);
assert.strictEqual(r5.status, 'UNKNOWN', 'Blank bank must return UNKNOWN for Auxilo');
assert.strictEqual(r5.reason_code, 'BANK_VERIFICATION_REQUIRED');

// Test 6: "OTHER" bank -> FAIL for Auxilo (non-nationalised not accepted), PASS for Fibe
const b6 = classifyBank('OTHER');
const r6 = evaluateBank(b6, auxiloCriteria);
assert.strictEqual(r6.status, 'FAIL', 'OTHER bank must FAIL for Auxilo (non-nationalised)');
const r6f = evaluateBank(b6, fibeCriteria);
assert.strictEqual(r6f.status, 'PASS', 'OTHER bank must PASS for Fibe');

console.log('✓ All 6 Bank unit tests passed successfully.');
