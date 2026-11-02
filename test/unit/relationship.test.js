const assert = require('assert');
const { normalizeRelationship } = require('../../src/config/relationship_map');
const { evaluateRelationship } = require('../../src/engine/evaluators/relationship');

console.log('--- RUNNING RELATIONSHIP UNIT TESTS ---');

const gyandhanCriteria = {
  allowed_relations: ['Mother', 'Father', 'Sibling', 'Blood relation']
};

const fibeCriteria = {
  allowed_relations: ['Mother', 'Father', 'Grandfather', 'Sibling', 'Siblings', 'Any relative']
};

// Test 1: Mother -> PASS for both
const r1 = evaluateRelationship(normalizeRelationship('Mother'), gyandhanCriteria);
assert.strictEqual(r1.status, 'PASS', 'Mother should pass Gyandhan');

// Test 2: Brother (Employed) -> PASS for Gyandhan (normalized to Sibling / Blood relation)
const r2 = evaluateRelationship(normalizeRelationship('Brother (Employed)'), gyandhanCriteria);
assert.strictEqual(r2.status, 'PASS', 'Brother (Employed) must pass Gyandhan as Sibling/Blood relation');
assert.strictEqual(r2.canonical, 'Brother');

// Test 3: Sister (Employed) -> PASS for Gyandhan
const r3 = evaluateRelationship(normalizeRelationship('Sister (Employed)'), gyandhanCriteria);
assert.strictEqual(r3.status, 'PASS', 'Sister (Employed) must pass Gyandhan as Sibling/Blood relation');

// Test 4: Other -> FAIL for Gyandhan (does not allow Any relative)
const r4 = evaluateRelationship(normalizeRelationship('Other'), gyandhanCriteria);
assert.strictEqual(r4.status, 'FAIL', 'Other must FAIL for Gyandhan');

// Test 5: Other -> PASS for Fibe (explicitly allows "Any relative")
const r5 = evaluateRelationship(normalizeRelationship('Other'), fibeCriteria);
assert.strictEqual(r5.status, 'PASS', 'Other must PASS for Fibe because Fibe permits Any relative');

// Test 6: Spouse -> FAIL for Gyandhan, PASS for Northern Arc
const northernArcCriteria = {
  allowed_relations: ['Mother', 'Father', 'Sibling', 'Spouse']
};
const r6 = evaluateRelationship(normalizeRelationship('Spouse'), northernArcCriteria);
assert.strictEqual(r6.status, 'PASS', 'Spouse must pass Northern Arc');

const r7 = evaluateRelationship(normalizeRelationship('Spouse'), gyandhanCriteria);
assert.strictEqual(r7.status, 'FAIL', 'Spouse must fail Gyandhan');

// Test 7: Missing/Unspecified relation -> UNKNOWN
const r8 = evaluateRelationship(normalizeRelationship(null), gyandhanCriteria);
assert.strictEqual(r8.status, 'UNKNOWN', 'Missing relation must return UNKNOWN');

console.log('✓ All 7 Relationship unit tests passed successfully.');
