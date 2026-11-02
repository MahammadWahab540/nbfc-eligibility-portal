/**
 * Test Execution Suite for NBFC Eligibility & Suggestion System
 * Validates business scenarios against the upgraded 3-valued engine
 */

const NBFCSuggestionEngine = require('./engine');
const engine = new NBFCSuggestionEngine();

// The user's exact inbound KYC payload
const userPayload = {
  "event_type": "KYC_SUBMISSION",
  "user_details": {
    "phone_number": "9705334008",
    "user_id": "e0a5860a-462b-41c9-9e24-7daff87f1367",
    "country_code": "+91"
  },
  "co_applicant_details": {
    "name": "Kuna Kavitha",
    "age": "43",
    "state": "Telangana",
    "city": "Hyderabad",
    "email": "kavithakuna214@gmail.com",
    "relation": "Mother",
    "other_relation": null,
    "user_applicant_id": "350bbf59-bc5f-4376-80a6-84aa65373bc5",
    "phone_number": "9381461252"
  },
  "cibil_details": {
    "cibil_score": 735,
    "cibil_score_range": "700 - 900"
  },
  "employment_details": {
    "employment_type": "SELF_EMPLOYED",
    "monthly_income": 45000,
    "occupation": "SHOP_OWNER"
  },
  "bank_details": {
    "bank_name": "OTHER"
  },
  "address_details": {
    "door_number": "12-4/A"
  },
  "parameter_questions": {
    "is_pan_aadhaar_linked": true,
    "has_e_pan_or_physical_pan": true,
    "has_dob_mismatch": false,
    "has_name_mismatch": false,
    "has_door_number": true
  },
  "selected_emi_tenure": 36
};

const defaultQuestions = {
  is_pan_aadhaar_linked: true,
  has_e_pan_or_physical_pan: true,
  has_dob_mismatch: false,
  has_name_mismatch: false,
  has_door_number: true
};

console.log('======================================================================');
console.log('SCENARIO 1: USER INBOUND KYC PAYLOAD (Mother, Age 43, Income 45k, Bank OTHER)');
console.log('======================================================================');
const result1 = engine.evaluate(userPayload, defaultQuestions);

console.log(`Eligible NBFCs (${result1.summary.eligible_count}):`);
result1.eligible_nbfcs.forEach((n, idx) => {
  console.log(`  [Rank ${idx + 1}] ${n.partner_name} (Priority: #${n.priority})`);
});
console.log(`\nIneligible NBFCs (${result1.summary.ineligible_count}):`);
result1.ineligible_nbfcs.forEach(n => {
  console.log(`  [Rejected] ${n.partner_name}: ${n.failures.join('; ')}`);
});

console.log('\n======================================================================');
console.log('SCENARIO 2: NAME MISMATCH DETECTED (Aadhaar Name != PAN Name)');
console.log('======================================================================');
const result2 = engine.evaluate(userPayload, {
  ...defaultQuestions,
  has_name_mismatch: true // Name mismatch exists
});

console.log(`Eligible NBFCs: ${result2.eligible_nbfcs.map(n => n.partner_name).join(', ') || 'NONE'}`);
console.log(`Ineligible NBFCs:`);
result2.ineligible_nbfcs.forEach(n => {
  console.log(`  - ${n.partner_name}: ${n.failures.join('; ')}`);
});

console.log('\n======================================================================');
console.log('SCENARIO 3: REGIONAL EXCEPTION (Assam - Guwahati vs Assam - Silchar)');
console.log('======================================================================');
const payloadGuwahati = JSON.parse(JSON.stringify(userPayload));
payloadGuwahati.co_applicant_details.state = 'Assam';
payloadGuwahati.co_applicant_details.city = 'Guwahati';

const payloadSilchar = JSON.parse(JSON.stringify(userPayload));
payloadSilchar.co_applicant_details.state = 'Assam';
payloadSilchar.co_applicant_details.city = 'Silchar';

const resGuwahati = engine.evaluate(payloadGuwahati, defaultQuestions);
const resSilchar = engine.evaluate(payloadSilchar, defaultQuestions);

const gyanGuwahati = resGuwahati.eligible_nbfcs.find(n => n.partner_id === 'gyandhan');
const gyanSilchar = resSilchar.ineligible_nbfcs.find(n => n.partner_id === 'gyandhan');

console.log(`Assam - Guwahati Gyandhan Status: ${gyanGuwahati ? 'ELIGIBLE (Exception applied!)' : 'INELIGIBLE'}`);
console.log(`Assam - Silchar Gyandhan Status: ${gyanSilchar ? 'INELIGIBLE -> ' + gyanSilchar.failures.join('; ') : 'ELIGIBLE'}`);

console.log('\n======================================================================');
console.log('SCENARIO 4: OCCUPATION RESTRICTION (Politician / PEP)');
console.log('======================================================================');
const payloadPolitician = JSON.parse(JSON.stringify(userPayload));
payloadPolitician.employment_details.occupation = 'POLITICIAN';

const resPolitician = engine.evaluate(payloadPolitician, defaultQuestions);
console.log(`Eligible NBFCs for Politician: ${resPolitician.eligible_nbfcs.map(n => n.partner_name).join(', ') || 'NONE'}`);
console.log(`Ineligible NBFCs:`);
resPolitician.ineligible_nbfcs.forEach(n => {
  console.log(`  - ${n.partner_name}: ${n.failures.join('; ')}`);
});
