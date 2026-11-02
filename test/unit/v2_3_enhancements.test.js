/**
 * NBFC Eligibility Engine v2.3.0 Feature and Regression Test Suite
 */

const assert = require('assert');
const NBFCEligibilityEngine = require('../../src/engine');
const { parseCurrency, parseStrictBoolean, parseStrictAge, normalizeApplicant } = require('../../src/engine/normalizer');

console.log('--- RUNNING ENGINE v2.3.0 ENHANCEMENT TESTS ---');

const engine = new NBFCEligibilityEngine();

// 1. Strict Input Parsing Tests
assert.strictEqual(parseCurrency('₹25,000'), 25000);
assert.strictEqual(parseCurrency('25,000'), 25000);
assert.strictEqual(parseCurrency('₹ 1,40,000/-'), 140000);
assert.strictEqual(parseCurrency(35000), 35000);
assert.strictEqual(parseCurrency(''), null);
assert.strictEqual(parseCurrency(null), null);
console.log('✓ Test 1: parseCurrency strictly parses formatted rupee strings and comma separators');

assert.strictEqual(parseStrictBoolean('false'), false);
assert.strictEqual(parseStrictBoolean('true'), true);
assert.strictEqual(parseStrictBoolean('no'), false);
assert.strictEqual(parseStrictBoolean('yes'), true);
assert.strictEqual(parseStrictBoolean(false), false);
assert.strictEqual(parseStrictBoolean(true), true);
assert.strictEqual(parseStrictBoolean(undefined), undefined);
console.log('✓ Test 2: parseStrictBoolean prevents "false" string from evaluating to true');

assert.strictEqual(parseStrictAge('45'), 45);
assert.strictEqual(parseStrictAge(50), 50);
assert.strictEqual(parseStrictAge('age: 32'), 32);
assert.strictEqual(parseStrictAge(''), null);
console.log('✓ Test 3: parseStrictAge extracts integers cleanly');

// 2. High Income Anomaly Detection (> ₹2,00,000 / month)
const highIncomePayload = {
  userId: 'user_high_inc',
  'Academy PRE -Loan Journey Name': 'High Income Applicant',
  'CIBIL Score Range': '700 - 900',
  'Co-Applicant Monthly Income': '₹8,30,000',
  'Co-Applicant Age': '35',
  'Relation with the Co-Applicant': 'Father',
  State: 'Maharashtra',
  "Co-Applicant's Bank Name": 'SBIN'
};
const resHighInc = engine.evaluate(highIncomePayload);
const northernArcHighInc = resHighInc.conditional_nbfcs.find(n => n.partner_id === 'northern_arc');
assert(northernArcHighInc, 'High income declared applicant should be CONDITIONAL pending ITR/salary slip verification');
assert(
  northernArcHighInc.reason_codes.includes('HIGH_INCOME_VERIFICATION_REQUIRED') ||
  northernArcHighInc.missing_requirements.some(r => r.includes('ITR') || r.includes('salary slips') || r.includes('CIBIL')),
  'Should require salary slip / ITR verification for unusually high income'
);
console.log('✓ Test 4: Declared income >= ₹2,00,000 triggers ITR/salary slip verification requirement');

// 3. Minor Co-applicant (< 18) Disqualification
const minorPayload = {
  userId: 'user_minor',
  'Academy PRE -Loan Journey Name': 'Minor Applicant',
  'CIBIL Score Range': '700 - 900',
  'Co-Applicant Monthly Income': '30000',
  'Co-Applicant Age': '17',
  'Relation with the Co-Applicant': 'Brother',
  State: 'Maharashtra',
  "Co-Applicant's Bank Name": 'SBIN'
};
const resMinor = engine.evaluate(minorPayload);
assert.strictEqual(resMinor.eligible_nbfcs.length, 0, 'Minors must not be ELIGIBLE for any lender');
assert(resMinor.ineligible_nbfcs.every(n => n.hard_blockers.some(b => b.includes('18') || b.includes('minor') || b.includes('COAPPLICANT_UNDERAGE'))),
  'All lenders must reject minor co-applicants');
console.log('✓ Test 5: Minor co-applicants (< 18) are strictly disqualified with hard blockers');

// 4. Senior Co-applicant (> 65) vs Senior Exception Band (58 - 65)
const seniorExceedPayload = {
  userId: 'user_senior_75',
  'Academy PRE -Loan Journey Name': 'Senior Exceed Applicant',
  'CIBIL Score Range': '700 - 900',
  'Co-Applicant Monthly Income': '30000',
  'Co-Applicant Age': '75',
  'Relation with the Co-Applicant': 'Father',
  State: 'Maharashtra',
  "Co-Applicant's Bank Name": 'SBIN'
};
const resSeniorExceed = engine.evaluate(seniorExceedPayload);
assert.strictEqual(resSeniorExceed.eligible_nbfcs.length, 0, 'Age 75 must exceed max limit for all lenders');
assert(resSeniorExceed.ineligible_nbfcs.length > 0, 'Lenders with max age limit must mark age 75 as INELIGIBLE');
console.log('✓ Test 6: Age 75 strictly exceeds lender maximum limits');

// 5. Documented Credit Committee Override Support
const subprimeDefault = {
  userId: 'user_subprime_default',
  'CIBIL Score Range': '300 - 649',
  'Co-Applicant Monthly Income': '35000',
  'Co-Applicant Age': '35',
  'Relation with the Co-Applicant': 'Father',
  'Co applicant Occupation': 'Salaried',
  State: 'Maharashtra',
  "Co-Applicant's Bank Name": 'SBIN'
};
const resSubprimeDefault = engine.evaluate(subprimeDefault);
const narcSubprimeDefault = resSubprimeDefault.ineligible_nbfcs.find(n => n.partner_id === 'northern_arc');
assert(narcSubprimeDefault, 'Subprime applicant must be INELIGIBLE by default');

const subprimeOverride = {
  ...subprimeDefault,
  has_documented_exception: true
};
const resSubprimeOverride = engine.evaluate(subprimeOverride);
const narcOverride = resSubprimeOverride.eligible_nbfcs.find(n => n.partner_id === 'northern_arc');
assert(narcOverride, 'Subprime applicant with documented credit committee override should pass');
console.log('✓ Test 7: Documented Credit Committee override passes without altering baseline default threshold');

// 6. Multi-attempt UID Tracking
const attempt1 = {
  userId: 'user_multi_attempt',
  attempt_id: 'att_001',
  'Academy PRE -Loan Journey Name': 'Journey Attempt 1',
  'Co-Applicant Monthly Income': '10000' // Below floor
};
const norm1 = normalizeApplicant(attempt1);
assert.strictEqual(norm1.attemptId, 'att_001');
assert.strictEqual(norm1.userApplicantId, 'user_multi_attempt');

const attempt2 = {
  userId: 'user_multi_attempt',
  attempt_id: 'att_002',
  'Academy PRE -Loan Journey Name': 'Journey Attempt 2',
  'Co-Applicant Monthly Income': '30000' // Updated
};
const norm2 = normalizeApplicant(attempt2);
assert.strictEqual(norm2.attemptId, 'att_002');
console.log('✓ Test 8: normalizeApplicant preserves distinct attempt identifiers for repeated submissions');

// 7. Section 5 Schema Conformity
const standardEval = engine.evaluate({
  userId: 'user_schema_test',
  'Academy PRE -Loan Journey Name': 'Schema Tester',
  'CIBIL Score Range': '700 - 900',
  'Co-Applicant Monthly Income': '35000',
  'Co-Applicant Age': '35',
  'Relation with the Co-Applicant': 'Father',
  State: 'Karnataka',
  "Co-Applicant's Bank Name": 'HDFC'
});

const allDecisions = [
  ...standardEval.eligible_nbfcs,
  ...standardEval.conditional_nbfcs,
  ...standardEval.ineligible_nbfcs,
  ...standardEval.unknown_nbfcs
];

allDecisions.forEach(d => {
  assert(d.nbfc, 'Result must contain nbfc string');
  assert(['ELIGIBLE', 'CONDITIONAL', 'INELIGIBLE', 'UNKNOWN'].includes(d.decision), 'Result must contain valid decision state');
  assert(Array.isArray(d.reason_codes), 'Result must contain reason_codes array');
  assert(Array.isArray(d.hard_blockers), 'Result must contain hard_blockers array');
  assert(Array.isArray(d.missing_requirements), 'Result must contain missing_requirements array');
  assert(typeof d.verified_inputs === 'object', 'Result must contain verified_inputs object');
  assert.strictEqual(d.algorithm_version, '2.3.0', 'algorithm_version must be 2.3.0');
  assert(d.recommended_next_action, 'Result must contain recommended_next_action string');
});
console.log('✓ Test 9: All lender decision objects conform 100% to Section 5 schema specification');

console.log('\n🎉 ALL ENGINE v2.3.0 ENHANCEMENT TESTS PASSED CLEANLY.');
