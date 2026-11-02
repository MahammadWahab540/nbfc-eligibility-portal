const assert = require('assert');
const { evaluateIdentity } = require('../../src/engine/evaluators/identity');

console.log('--- RUNNING IDENTITY & PARAMETER QUESTIONS UNIT TESTS ---');

const strictCriteria = {
  pan_aadhaar_linked_mandatory: true,
  pan_card_mandatory: true,
  dob_mismatch_allowed: false,
  name_mismatch_allowed: false,
  door_number_mandatory: true
};

// Test 1: All questions verified true/false as expected -> all PASS
const r1 = evaluateIdentity({
  is_pan_aadhaar_linked: true,
  has_e_pan_or_physical_pan: true,
  has_dob_mismatch: false,
  has_name_mismatch: false,
  has_door_number: true
}, strictCriteria);
assert.strictEqual(r1.failures.length, 0, 'No failures expected');
assert.strictEqual(r1.unknownRequirements.length, 0, 'No unknowns expected');
assert.strictEqual(r1.matched.length, 5, '5 matched criteria expected');

// Test 2: PAN-Aadhaar not linked -> FAIL
const r2 = evaluateIdentity({
  is_pan_aadhaar_linked: false,
  has_e_pan_or_physical_pan: true,
  has_dob_mismatch: false,
  has_name_mismatch: false,
  has_door_number: true
}, strictCriteria);
assert.strictEqual(r2.failures.length, 1);
assert.strictEqual(r2.failures[0].reason_code, 'PAN_AADHAAR_NOT_LINKED');

// Test 3: Name mismatch detected -> FAIL
const r3 = evaluateIdentity({
  is_pan_aadhaar_linked: true,
  has_e_pan_or_physical_pan: true,
  has_dob_mismatch: false,
  has_name_mismatch: true,
  has_door_number: true
}, strictCriteria);
assert.strictEqual(r3.failures.length, 1);
assert.strictEqual(r3.failures[0].reason_code, 'NAME_MISMATCH_DISALLOWED');

// Test 4: Questions not answered (undefined) -> UNKNOWN requirements (not assumed true!)
const r4 = evaluateIdentity({}, strictCriteria);
assert.strictEqual(r4.failures.length, 0);
assert.strictEqual(r4.unknownRequirements.length, 5, 'All 5 questions must be marked UNKNOWN if missing');
const reasonCodes = r4.unknownRequirements.map(u => u.reason_code);
assert(reasonCodes.includes('PAN_AADHAAR_STATUS_UNVERIFIED'));
assert(reasonCodes.includes('PAN_AVAILABILITY_UNVERIFIED'));
assert(reasonCodes.includes('DOB_MISMATCH_UNVERIFIED'));
assert(reasonCodes.includes('NAME_MISMATCH_UNVERIFIED'));
assert(reasonCodes.includes('DOOR_NUMBER_UNVERIFIED'));

console.log('✓ All 4 Identity unit tests passed successfully.');
