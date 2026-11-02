const assert = require('assert');
const NBFCEligibilityEngine = require('../../src/engine/index');

console.log('--- GENERATING AND EXECUTING 100+ SYNTHETIC EDGE CASE TESTS ---');

const engine = new NBFCEligibilityEngine();

const cibilVariants = [
  { label: 'CIBIL_750', data: { cibil_score: 750 } },
  { label: 'CIBIL_715', data: { cibil_score: 715 } },
  { label: 'CIBIL_680', data: { cibil_score: 680 } },
  { label: 'CIBIL_640', data: { cibil_score: 640 } },
  { label: 'CIBIL_700_900', data: { cibil_score_range: '700 - 900' } },
  { label: 'CIBIL_650_699', data: { cibil_score_range: '650 - 699' } },
  { label: 'CIBIL_300_649', data: { cibil_score_range: '300 - 649' } },
  { label: 'CIBIL_NTC', data: { cibil_score_range: 'No CIBIL Score' } },
  { label: 'CIBIL_NULL', data: {} }
];

const incomeVariants = [
  { label: 'INC_NULL', val: null },
  { label: 'INC_12K', val: 12000 },
  { label: 'INC_15K', val: 15000 },
  { label: 'INC_20K', val: 20000 },
  { label: 'INC_25K', val: 25000 },
  { label: 'INC_50K', val: 50000 }
];

const ageVariants = [
  { label: 'AGE_NULL', val: null },
  { label: 'AGE_18', val: 18 },
  { label: 'AGE_25', val: 25 },
  { label: 'AGE_58', val: 58 },
  { label: 'AGE_59', val: 59 },
  { label: 'AGE_65', val: 65 },
  { label: 'AGE_72', val: 72 }
];

const relationVariants = [
  { label: 'REL_MOTHER', val: 'Mother' },
  { label: 'REL_FATHER', val: 'Father' },
  { label: 'REL_BROTHER_EMP', val: 'Brother (Employed)' },
  { label: 'REL_SISTER_EMP', val: 'Sister (Employed)' },
  { label: 'REL_SPOUSE', val: 'Spouse' },
  { label: 'REL_GUARDIAN', val: 'Legal Guardian' },
  { label: 'REL_OTHER', val: 'Other' },
  { label: 'REL_NULL', val: null }
];

const bankVariants = [
  { label: 'BANK_SBIN', val: 'SBIN' }, // PSU
  { label: 'BANK_HDFC', val: 'HDFC' }, // Private
  { label: 'BANK_KVGB', val: 'KVGB' }, // Grameena
  { label: 'BANK_OTHER', val: 'OTHER' },
  { label: 'BANK_NULL', val: null }
];

const regionVariants = [
  { label: 'REG_KARNATAKA', state: 'Karnataka', city: 'Bengaluru' },
  { label: 'REG_ASSAM_GUWAHATI', state: 'Assam', city: 'Guwahati' },
  { label: 'REG_ASSAM_SILCHAR', state: 'Assam', city: 'Silchar' },
  { label: 'REG_JK', state: 'Jammu & Kashmir', city: 'Srinagar' },
  { label: 'REG_NULL', state: null, city: null }
];

const questionVariants = [
  {
    label: 'Q_ALL_PASS',
    q: { is_pan_aadhaar_linked: true, has_e_pan_or_physical_pan: true, has_dob_mismatch: false, has_name_mismatch: false, has_door_number: true }
  },
  {
    label: 'Q_PAN_UNLINKED',
    q: { is_pan_aadhaar_linked: false, has_e_pan_or_physical_pan: true, has_dob_mismatch: false, has_name_mismatch: false, has_door_number: true }
  },
  {
    label: 'Q_NAME_MISMATCH',
    q: { is_pan_aadhaar_linked: true, has_e_pan_or_physical_pan: true, has_dob_mismatch: false, has_name_mismatch: true, has_door_number: true }
  },
  {
    label: 'Q_ALL_UNANSWERED',
    q: {}
  }
];

const testCases = [];
let caseId = 1;

// Generate 120 meaningful, distinct combinations across the dimensions
for (let i = 0; i < 120; i++) {
  const cib = cibilVariants[i % cibilVariants.length];
  const inc = incomeVariants[(i * 2) % incomeVariants.length];
  const age = ageVariants[(i * 3) % ageVariants.length];
  const rel = relationVariants[(i * 4) % relationVariants.length];
  const bnk = bankVariants[(i * 5) % bankVariants.length];
  const reg = regionVariants[(i * 6) % regionVariants.length];
  const qv  = questionVariants[(i * 7) % questionVariants.length];

  testCases.push({
    id: caseId++,
    description: `Test #${caseId - 1}: ${cib.label} | ${inc.label} | ${age.label} | ${rel.label} | ${bnk.label} | ${reg.label} | ${qv.label}`,
    payload: {
      user_details: { user_id: `synthetic-${caseId}` },
      co_applicant_details: {
        name: `Synthetic User ${caseId}`,
        age: age.val,
        relation: rel.val,
        state: reg.state,
        city: reg.city
      },
      cibil_details: cib.data,
      employment_details: {
        monthly_income: inc.val,
        occupation: 'ACCOUNTANT'
      },
      bank_details: {
        bank_name: bnk.val
      },
      address_details: {
        door_number: '10'
      },
      parameter_questions: qv.q
    }
  });
}

console.log(`Executing ${testCases.length} targeted edge-case scenarios...`);

let passedTests = 0;
testCases.forEach((tc) => {
  const result = engine.evaluate(tc.payload);

  // Assert essential invariant:
  // Total lenders evaluated must equal active partners count (6)
  assert.strictEqual(result.summary.total_lenders_evaluated, 6, `Case ${tc.id}: Must evaluate exactly 6 lenders`);

  // Assert sum of eligible + conditional + ineligible equals 6
  const totalClassified = result.eligible_nbfcs.length + result.conditional_nbfcs.length + result.ineligible_nbfcs.length;
  assert.strictEqual(totalClassified, 6, `Case ${tc.id}: Sum of classifications must equal total lenders (6)`);

  // Assert rankings are sequential starting at 1
  result.eligible_nbfcs.forEach((lender, rankIdx) => {
    assert.strictEqual(lender.rank, rankIdx + 1, `Case ${tc.id}: Rank must be strictly sequential (1, 2, ...)`);
  });

  // Invariant: If CIBIL is 300-649, NO lender requiring >=651 can be ELIGIBLE
  if (tc.description.includes('CIBIL_300_649')) {
    result.eligible_nbfcs.forEach(l => {
      assert.fail(`Case ${tc.id}: Lender ${l.partner_id} falsely approved for CIBIL 300-649`);
    });
  }

  // Invariant: If co-applicant is underage (18), NO lender can be ELIGIBLE
  if (tc.description.includes('AGE_18')) {
    assert.strictEqual(result.eligible_nbfcs.length, 0, `Case ${tc.id}: Underage co-applicant cannot be eligible for any lender`);
  }

  // Invariant: If income is null, NO lender can be ELIGIBLE without income verification
  if (tc.description.includes('INC_NULL')) {
    assert.strictEqual(result.eligible_nbfcs.length, 0, `Case ${tc.id}: Missing income cannot result in ELIGIBLE without verification`);
  }

  passedTests++;
});

console.log(`✓ All ${passedTests} synthetic edge-case tests passed with 100% adherence to invariant laws.`);
