const assert = require('assert');
const NBFCEligibilityEngine = require('../../src/engine/index');

console.log('--- RUNNING LENDER THRESHOLD BOUNDARY TESTS ---');

const engine = new NBFCEligibilityEngine();

function createBasePayload(overrides = {}) {
  return {
    user_details: { user_id: 'boundary-test' },
    co_applicant_details: {
      name: 'Test CoApp',
      age: 40,
      relation: 'Mother',
      state: 'Karnataka',
      city: 'Bengaluru'
    },
    cibil_details: {
      cibil_score: 750
    },
    employment_details: {
      monthly_income: 30000,
      occupation: 'ENGINEER'
    },
    bank_details: {
      bank_name: 'SBIN' // PSU Bank
    },
    address_details: {
      door_number: '12-34'
    },
    parameter_questions: {
      is_pan_aadhaar_linked: true,
      has_e_pan_or_physical_pan: true,
      has_dob_mismatch: false,
      has_name_mismatch: false,
      has_door_number: true
    },
    ...overrides
  };
}

// 1. CIBIL Boundary Tests
// Score 710: Gyandhan (min 711) fails; Bajaj (min 721) fails; Fibe, Northern Arc, Auxilo, Techfino pass
const p710 = createBasePayload({ cibil_details: { cibil_score: 710 } });
const res710 = engine.evaluate(p710);
const eligible710 = res710.eligible_nbfcs.map(l => l.partner_id);
assert(!eligible710.includes('gyandhan'), 'Gyandhan should not be eligible with score 710 (requires 711)');
assert(!eligible710.includes('bajaj'), 'Bajaj should not be eligible with score 710 (requires 721)');
assert(eligible710.includes('fibe'), 'Fibe should be eligible with score 710');

// Score 711: Gyandhan passes; Bajaj still fails
const p711 = createBasePayload({ cibil_details: { cibil_score: 711 } });
const res711 = engine.evaluate(p711);
const eligible711 = res711.eligible_nbfcs.map(l => l.partner_id);
assert(eligible711.includes('gyandhan'), 'Gyandhan MUST be eligible with score 711');
assert(!eligible711.includes('bajaj'), 'Bajaj should not be eligible with score 711');

// Score 721: Bajaj passes
const p721 = createBasePayload({ cibil_details: { cibil_score: 721 } });
const res721 = engine.evaluate(p721);
const eligible721 = res721.eligible_nbfcs.map(l => l.partner_id);
assert(eligible721.includes('bajaj'), 'Bajaj MUST be eligible with score 721');

// 2. Income Boundary Tests
// Income 14,999: Gyandhan, Auxilo, Techfino fail
const p14999 = createBasePayload({ employment_details: { monthly_income: 14999, occupation: 'ENGINEER' } });
const res14999 = engine.evaluate(p14999);
const eligible14999 = res14999.eligible_nbfcs.map(l => l.partner_id);
assert(!eligible14999.includes('gyandhan'), 'Gyandhan fails with 14999 income');
assert(!eligible14999.includes('auxilo'), 'Auxilo fails with 14999 income');
assert(!eligible14999.includes('techfino'), 'Techfino fails with 14999 income');

// Income 19,999: Techfino fails (min 20000), Auxilo fails (min 25000)
const p19999 = createBasePayload({ employment_details: { monthly_income: 19999, occupation: 'ENGINEER' } });
const res19999 = engine.evaluate(p19999);
const eligible19999 = res19999.eligible_nbfcs.map(l => l.partner_id);
assert(!eligible19999.includes('techfino'), 'Techfino fails with 19999 income (min 20000)');
assert(!eligible19999.includes('auxilo'), 'Auxilo fails with 19999 income');

// Income 20,000: Techfino passes (min 20000), Auxilo fails (min 25000)
const p20000 = createBasePayload({ employment_details: { monthly_income: 20000, occupation: 'ENGINEER' } });
const res20000 = engine.evaluate(p20000);
const eligible20000 = res20000.eligible_nbfcs.map(l => l.partner_id);
assert(eligible20000.includes('techfino'), 'Techfino passes with 20000 income (min 20000)');
assert(!eligible20000.includes('auxilo'), 'Auxilo fails with 20000 income');

// Income 24,999: Auxilo fails (min 25000); Gyandhan (min 15000), Techfino (min 20000), Fibe, Northern Arc, Bajaj pass
const p24999 = createBasePayload({ employment_details: { monthly_income: 24999, occupation: 'ENGINEER' } });
const res24999 = engine.evaluate(p24999);
const eligible24999 = res24999.eligible_nbfcs.map(l => l.partner_id);
assert(eligible24999.includes('gyandhan'), 'Gyandhan passes with 24999 income (min 15000)');
assert(!eligible24999.includes('auxilo'), 'Auxilo fails with 24999 income');
assert(eligible24999.includes('techfino'), 'Techfino passes with 24999 income (min 20000)');
assert(eligible24999.includes('fibe'), 'Fibe passes with 24999 income');

// Income 25,000: Gyandhan, Auxilo, Techfino pass
const p25000 = createBasePayload({ employment_details: { monthly_income: 25000, occupation: 'ENGINEER' } });
const res25000 = engine.evaluate(p25000);
const eligible25000 = res25000.eligible_nbfcs.map(l => l.partner_id);
assert(eligible25000.includes('gyandhan'), 'Gyandhan passes with 25000 income');
assert(eligible25000.includes('auxilo'), 'Auxilo passes with 25000 income');
assert(eligible25000.includes('techfino'), 'Techfino passes with 25000 income');

// 3. Age Boundary Tests
// Age 58: All active lenders with max age >= 58 pass
const pAge58 = createBasePayload({ co_applicant_details: { name: 'A', age: 58, relation: 'Mother', state: 'Karnataka' } });
const resAge58 = engine.evaluate(pAge58);
const activeCount = engine.ruleSet.partners.filter(p => p.is_active !== false).length;
assert.strictEqual(resAge58.eligible_nbfcs.length, activeCount, `All ${activeCount} active lenders must be eligible for age 58`);

// Age 59: Gyandhan, Northern Arc, Auxilo, Techfino fail; Fibe (max 59), Feemonk (max 60) and Bajaj (max 65) pass
const pAge59 = createBasePayload({ co_applicant_details: { name: 'A', age: 59, relation: 'Mother', state: 'Karnataka' } });
const resAge59 = engine.evaluate(pAge59);
const eligibleAge59 = resAge59.eligible_nbfcs.map(l => l.partner_id);
assert(eligibleAge59.includes('fibe'), 'Fibe passes for age 59');
assert(eligibleAge59.includes('bajaj'), 'Bajaj passes for age 59');
assert(!eligibleAge59.includes('gyandhan'), 'Gyandhan fails for age 59');
assert(!eligibleAge59.includes('auxilo'), 'Auxilo fails for age 59');

// Age 65: Bajaj passes; Fibe fails
const pAge65 = createBasePayload({ co_applicant_details: { name: 'A', age: 65, relation: 'Mother', state: 'Karnataka' } });
const resAge65 = engine.evaluate(pAge65);
const eligibleAge65 = resAge65.eligible_nbfcs.map(l => l.partner_id);
assert(eligibleAge65.includes('bajaj'), 'Bajaj passes for age 65');
assert(!eligibleAge65.includes('fibe'), 'Fibe fails for age 65');

// Age 66: All lenders fail
const pAge66 = createBasePayload({ co_applicant_details: { name: 'A', age: 66, relation: 'Mother', state: 'Karnataka' } });
const resAge66 = engine.evaluate(pAge66);
assert.strictEqual(resAge66.eligible_nbfcs.length, 0, 'No lender allows age 66');

console.log('✓ All Lender threshold boundary tests passed successfully.');
