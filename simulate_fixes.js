const fs = require('fs');
const NBFCEligibilityEngine = require('./src/engine/index');

// Load fresh 150 leads
const sfData = require('./fresh_150_sf_data.json');
const academyMap = new Map();
sfData.academyRecords.forEach(a => academyMap.set(a.Id, a));

const coAppMap = new Map();
sfData.coAppRecords.forEach(c => {
  if (!coAppMap.has(c.Academy_Onboarding_PRE__c)) {
    coAppMap.set(c.Academy_Onboarding_PRE__c, c);
  }
});

// Let's test with engine instance
const engine = new NBFCEligibilityEngine();

// Test what happens currently vs with the fixes
console.log('--- SIMULATING ELIGIBILITY FOR 150 LEADS ---');

let totalLeads = sfData.academyRecords.length;
console.log('Total Leads:', totalLeads);

// Let's check with modified rules in-memory
const rules = JSON.parse(fs.readFileSync('./data/rules.json', 'utf8'));

// Gyandhan: allow prime bracket "700 - 900" to satisfy 711 cutoff
const gyan = rules.partners.find(p => p.id === 'gyandhan');
if (gyan) {
  gyan.criteria.allow_prime_bracket = true;
}

// Techfino: remove door number requirement
const tech = rules.partners.find(p => p.id === 'techfino');
if (tech) {
  tech.criteria.door_number_mandatory = false;
}

engine.ruleSet = rules;

const eligibleCounts = {};
const conditionalCounts = {};
const leadResults = [];

sfData.academyRecords.forEach((a, idx) => {
  const co = coAppMap.get(a.Id) || {};
  const state = a.State__c || co.Co_Applicant_state_pre__c || a.Co_Applicant_State_PRE__c || null;
  const empType = co.Co_Applicant_Employment_Type_PRE__c || a.Co_Applicant_Employment_Type_PRE__c || null;

  const payload = {
    Id: co.Id || a.Id,
    salesforce_id: co.Id || a.Id,
    CIBIL_SCORE_RANGE_PRE__c: co.CIBIL_SCORE_RANGE_PRE__c,
    COAPPLICANT_MONTHLY_INCOME_PRE__c: co.COAPPLICANT_MONTHLY_INCOME_PRE__c,
    Co_Applicant_s_Bank_Name_PRE__c: co.Co_Applicant_s_Bank_Name_PRE__c,
    RELATION_WITH_THE_COAPPLICANT_PRE__c: co.RELATION_WITH_THE_COAPPLICANT_PRE__c,
    Co_Applicant_Occupation_PRE__c: co.Co_Applicant_Occupation_PRE__c,
    Co_Applicant_Employment_Type_PRE__c: empType,
    Co_Applicant_age_pre__c: co.Co_Applicant_age_pre__c,
    State: state,
    Co_Applicant_state_pre__c: state,
    parameter_questions: {
      has_name_mismatch: co.NAME_mismatch_in_Adhaar_and_PAN__c === 'Yes',
      has_dob_mismatch: co.DOB_mismatch_in_Adhaar_and_PAN__c === 'Yes',
      is_pan_aadhaar_linked: co.PAN_and_Adhaar_is_to_be_linked__c !== 'No',
      has_e_pan_or_physical_pan: co.E_Pan_Physical_PAN_Availability__c !== 'No',
      has_door_number: true // In preliminary evaluation or relaxed
    }
  };

  const res = engine.evaluate(payload);

  (res.eligible_nbfcs || []).forEach(e => {
    eligibleCounts[e.partner_name] = (eligibleCounts[e.partner_name] || 0) + 1;
  });
  (res.conditional_nbfcs || []).forEach(c => {
    conditionalCounts[c.partner_name] = (conditionalCounts[c.partner_name] || 0) + 1;
  });

  leadResults.push({
    leadIndex: idx + 1,
    academyId: a.Id,
    coAppId: co.Id,
    state,
    income: co.COAPPLICANT_MONTHLY_INCOME_PRE__c,
    cibil: co.CIBIL_SCORE_RANGE_PRE__c,
    eligible: res.eligible_nbfcs.map(e => e.partner_name),
    conditional: res.conditional_nbfcs.map(c => c.partner_name)
  });
});

console.log('Eligible Counts with Fixes:', eligibleCounts);
console.log('Conditional Counts with Fixes:', conditionalCounts);

// Sample leads where Techfino and Gyandhan are eligible
const bothEligible = leadResults.filter(l => l.eligible.includes('Techfino') && l.eligible.includes('Gyandhan'));
console.log(`\nLeads where BOTH Techfino and Gyandhan are ELIGIBLE: ${bothEligible.length}`);
console.log('Sample 3 leads where both are eligible:');
console.log(JSON.stringify(bothEligible.slice(0, 3), null, 2));
