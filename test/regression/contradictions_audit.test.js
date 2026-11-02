const assert = require('assert');
const NBFCEligibilityEngine = require('../../src/engine/index');

console.log('--- RUNNING CONTRADICTIONS REGRESSION TEST SUITE ---');

const engine = new NBFCEligibilityEngine();

// 1. Northern Arc Income Threshold Fix (15k vs old 18k)
const naPayload = {
  'userId': 'test-na-15k',
  'Choose NBFC': 'NORTHERN ARC',
  'CIBIL Score Range': '700 - 900',
  'Relation with the Co-Applicant': 'Father',
  'Co applicant Occupation': 'Farmer',
  'Co-Applicant Age': '45',
  'State': 'Tamil Nadu',
  'Co-Applicant Monthly Income': '15000'
};
const resNA = engine.evaluate(naPayload);
const naLender = resNA.eligible_nbfcs.find(l => l.partner_id === 'northern_arc');
assert.ok(naLender, 'Northern Arc must be ELIGIBLE for income ₹15,000');
assert.strictEqual(naLender.decision_status, 'ELIGIBLE');

// 2. Gyandhan & Techfino Tiered Income Fix (20k in conditional review band)
const gyaPayload = {
  'userId': 'test-gya-20k',
  'Choose NBFC': 'GYANDHAN',
  'CIBIL Score Range': '700 - 900',
  'Relation with the Co-Applicant': 'Father',
  'Co applicant Occupation': 'Farmer',
  'Co-Applicant Age': '45',
  'State': 'Maharashtra',
  'Co-Applicant Monthly Income': '20000'
};
const resGya = engine.evaluate(gyaPayload);
const gyaLender = resGya.conditional_nbfcs.find(l => l.partner_id === 'gyandhan');
assert.ok(gyaLender, 'Gyandhan must be CONDITIONAL (not hard-rejected) for income ₹20,000');
assert.strictEqual(gyaLender.decision_status, 'CONDITIONAL');
assert.ok(
  gyaLender.missing_requirements.some(r => r.toLowerCase().includes('bank statement') || r.toLowerCase().includes('income verification')),
  'Gyandhan must request bank statement / income verification'
);

const techLender = resGya.conditional_nbfcs.find(l => l.partner_id === 'techfino');
assert.ok(techLender, 'Techfino must be CONDITIONAL for income ₹20,000');

// 3. Genuine Sub-₹15,000 Income must remain hard INELIGIBLE
const sub15kPayload = {
  'userId': 'test-sub15k',
  'Choose NBFC': 'GYANDHAN',
  'CIBIL Score Range': '700 - 900',
  'Relation with the Co-Applicant': 'Father',
  'Co applicant Occupation': 'Farmer',
  'Co-Applicant Age': '45',
  'State': 'Maharashtra',
  'Co-Applicant Monthly Income': '10000'
};
const resSub15k = engine.evaluate(sub15kPayload);
const subGya = resSub15k.ineligible_nbfcs.find(l => l.partner_id === 'gyandhan');
assert.ok(subGya, 'Income < ₹15,000 must remain INELIGIBLE for Gyandhan');
assert.strictEqual(subGya.reason_code, 'MINIMUM_INCOME_NOT_MET');

// 4. Relationship 'Other' Fix
const otherRelPayload = {
  'userId': 'test-rel-other',
  'Choose NBFC': 'GYANDHAN',
  'CIBIL Score Range': '700 - 900',
  'Relation with the Co-Applicant': 'Other',
  'Co applicant Occupation': 'Businessperson',
  'Co-Applicant Age': '45',
  'State': 'Maharashtra',
  'Co-Applicant Monthly Income': '40000'
};
const resRel = engine.evaluate(otherRelPayload);
const gyaRel = resRel.conditional_nbfcs.find(l => l.partner_id === 'gyandhan');
assert.ok(gyaRel, "Relationship 'Other' must be CONDITIONAL (requires relationship clarification), not hard rejected");
assert.ok(
  gyaRel.missing_requirements.some(r => r.toLowerCase().includes('relationship')),
  "Must flag missing relationship verification proof for 'Other'"
);

// 5. Senior Co-Applicant Age Fix (60-62 yrs in exception band)
const age60Payload = {
  'userId': 'test-age-60',
  'Choose NBFC': 'GYANDHAN',
  'CIBIL Score Range': '700 - 900',
  'Relation with the Co-Applicant': 'Father',
  'Co applicant Occupation': 'Farmer',
  'Co-Applicant Age': '60',
  'State': 'Maharashtra',
  'Co-Applicant Monthly Income': '40000'
};
const resAge = engine.evaluate(age60Payload);
const gyaAge = resAge.conditional_nbfcs.find(l => l.partner_id === 'gyandhan');
assert.ok(gyaAge, 'Age 60 must be CONDITIONAL (senior tenure review), not hard-rejected');
assert.strictEqual(gyaAge.decision_status, 'CONDITIONAL');

// Age > 65 must remain hard INELIGIBLE
const age70Payload = { ...age60Payload, 'Co-Applicant Age': '70' };
const resAge70 = engine.evaluate(age70Payload);
const gyaAge70 = resAge70.ineligible_nbfcs.find(l => l.partner_id === 'gyandhan');
assert.ok(gyaAge70, 'Age > 65 must remain INELIGIBLE');
assert.strictEqual(gyaAge70.reason_code, 'AGE_EXCEEDS_MAX_LIMIT');

// 6. Metadata and Audit Schema Compliance
const sampleDecision = resNA.eligible_nbfcs[0];
assert.ok(sampleDecision.nbfc_code, 'Must return nbfc_code');
assert.ok(sampleDecision.partner_id, 'Must return partner_id');
assert.ok(sampleDecision.partner_name, 'Must return partner_name');
assert.ok(sampleDecision.decision_status, 'Must return decision_status');
assert.ok(sampleDecision.reason_code, 'Must return reason_code');
assert.ok(sampleDecision.explanation, 'Must return explanation');
assert.ok(Array.isArray(sampleDecision.rules_evaluated), 'Must return rules_evaluated array');
assert.ok(sampleDecision.input_values, 'Must return input_values');
assert.ok(sampleDecision.policy_version, 'Must return policy_version');
assert.ok(sampleDecision.effective_date, 'Must return effective_date');
assert.ok(sampleDecision.algorithm_version, 'Must return algorithm_version');
assert.ok(sampleDecision.recommended_next_action, 'Must return recommended_next_action');

console.log('✓ All 6 Contradictions Regression tests passed successfully.');
