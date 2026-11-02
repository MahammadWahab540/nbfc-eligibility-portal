/**
 * Test Execution Suite for NBFC Eligibility & Suggestion System
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
    "profile_pic_url": "https://nw-sales-prdzn-media-static.s3.ap-south-1.amazonaws.com/prod/media/co_applicant_photo/c022ad52-2f87-4ece-ac7c-ae52bb38e9e7_12_18_39_Attachment.jpg",
    "phone_number": "9381461252"
  },
  "cibil_details": {
    "cibil_score": 735,
    "cibil_score_range": "700 - 900",
    "document_url": "https://nw-sales-prdzn-media-static.s3.ap-south-1.amazonaws.com/prod/media/cibil_score/e70251bb-48dd-45fc-ad42-5fcf54dba7b4_12_16_58_Attachment.jpg"
  },
  "employment_details": {
    "employment_type": "SELF_EMPLOYED",
    "monthly_income": 45000,
    "occupation": "SHOP_OWNER",
    "other_occupation": null,
    "proof_type": "DONT_HAVE_ANY_BUSINESS_PROOF",
    "proof_document_url": ""
  },
  "bank_details": {
    "bank_name": "OTHER",
    "banking_facilities": "BOTH_DEBIT_CARD_AND_INTERNET_BANKING",
    "document_type": "CANCELLED_CHEQUE",
    "document_url": "https://nw-sales-prdzn-media-static.s3.ap-south-1.amazonaws.com/prod/media/bank_proof/cancelled_cheque/78dab599-c7e7-40cc-bf98-1f496e4a3ee0_12_28_41_Attachment.jpg",
    "bank_statement_doc_url": null
  },
  "address_details": {
    "door_number": "12-4/A",
    "proof_type": null,
    "proof_document_url": null
  },
  "submission_datetime": "2026-10-17 12:37:12",
  "status": "RESUBMITTED",
  "selected_emi_tenure": 36
};

console.log('======================================================================');
console.log('SCENARIO 1: USER INBOUND KYC PAYLOAD (Mother, Age 43, Income 45k, Bank OTHER)');
console.log('======================================================================');
const result1 = engine.evaluate(userPayload, {
  is_pan_aadhaar_linked: true,
  has_e_pan_or_physical_pan: true,
  has_dob_mismatch: false,
  has_name_mismatch: false,
  has_door_number: true
});

console.log(`Eligible NBFCs (${result1.summary.eligible_count}):`);
result1.eligible_nbfcs.forEach((n, idx) => {
  console.log(`  [Rank ${idx + 1}] ${n.partner_name} (Score: ${n.match_score})`);
});
console.log(`\nIneligible NBFCs (${result1.summary.ineligible_count}):`);
result1.ineligible_nbfcs.forEach(n => {
  console.log(`  [Rejected] ${n.partner_name}: ${n.failures.join('; ')}`);
});

console.log('\n======================================================================');
console.log('SCENARIO 2: NAME MISMATCH DETECTED (Aadhaar Name != PAN Name)');
console.log('======================================================================');
const result2 = engine.evaluate(userPayload, {
  is_pan_aadhaar_linked: true,
  has_e_pan_or_physical_pan: true,
  has_dob_mismatch: false,
  has_name_mismatch: true, // Name mismatch exists
  has_door_number: true
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

const resGuwahati = engine.evaluate(payloadGuwahati);
const resSilchar = engine.evaluate(payloadSilchar);

const gyanGuwahati = resGuwahati.eligible_nbfcs.find(n => n.partner_id === 'gyandhan');
const gyanSilchar = resSilchar.ineligible_nbfcs.find(n => n.partner_id === 'gyandhan');

console.log(`Assam - Guwahati Gyandhan Status: ${gyanGuwahati ? 'ELIGIBLE (Exception applied!)' : 'INELIGIBLE'}`);
console.log(`Assam - Silchar Gyandhan Status: ${gyanSilchar ? 'INELIGIBLE -> ' + gyanSilchar.failures.join('; ') : 'ELIGIBLE'}`);

console.log('\n======================================================================');
console.log('SCENARIO 4: OCCUPATION RESTRICTION (Politician / PEP)');
console.log('======================================================================');
const payloadPolitician = JSON.parse(JSON.stringify(userPayload));
payloadPolitician.employment_details.occupation = 'POLITICIAN';

const resPolitician = engine.evaluate(payloadPolitician);
console.log(`Eligible NBFCs for Politician: ${resPolitician.eligible_nbfcs.map(n => n.partner_name).join(', ')}`);
console.log(`Ineligible NBFCs:`);
resPolitician.ineligible_nbfcs.forEach(n => {
  console.log(`  - ${n.partner_name}: ${n.failures.join('; ')}`);
});
