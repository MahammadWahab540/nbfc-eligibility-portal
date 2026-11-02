/**
 * Applicant Data Normalizer & Attribute Extractor
 * Supports both:
 * 1. Direct Salesforce Production Field Schema (Flat SOQL query format):
 *    - Academy_Onboarding_PRE__r.userId__c
 *    - Id
 *    - Name
 *    - CIBIL_SCORE_RANGE_PRE__c
 *    - RELATION_WITH_THE_COAPPLICANT_PRE__c
 *    - COAPPLICANT_MONTHLY_INCOME_PRE__c / COAPP_MONTHLY_INCOME_PRE__c
 *    - Co_Applicant_Occupation_PRE__c
 *    - Co_Applicant_state_pre__c
 *    - Co_Applicant_age_pre__c
 *    - Co_Applicant_s_Bank_Name_PRE__c
 * 2. Nested Microservice Schema (co_applicant_details, cibil_details, etc.)
 */

const { normalizeRelationship } = require('../config/relationship_map');
const { classifyBank } = require('../config/bank_registry');

function normalizeApplicant(payload = {}, parameterQuestions = null) {
  const coApp = payload.co_applicant_details || {};
  const cibil = payload.cibil_details || {};
  const emp = payload.employment_details || {};
  const bank = payload.bank_details || {};
  const addr = payload.address_details || {};
  const user = payload.user_details || {};

  // 1. Identifiers (Salesforce Id & User Id)
  const salesforceId = payload.Id || payload.salesforce_id || user.salesforce_id || null;
  const userApplicantId =
    payload['Academy_Onboarding_PRE__r.userId__c'] ||
    payload.Academy_Onboarding_PRE__r?.userId__c ||
    payload.userId__c ||
    user.user_id ||
    coApp.user_applicant_id ||
    payload.user_id ||
    'unspecified-user';

  // 2. Name
  const name = payload.Name || coApp.name || payload.name || 'Applicant';

  // 3. CIBIL score extraction (Supports CIBIL_SCORE_RANGE_PRE__c)
  let exactScore = null;
  let rangeString = null;

  const rawRange = payload.CIBIL_SCORE_RANGE_PRE__c || cibil.cibil_score_range || payload.cibil_score_range || null;
  if (rawRange && typeof rawRange === 'string') {
    rangeString = rawRange.trim();
  }

  const rawExactScore = cibil.cibil_score !== undefined ? cibil.cibil_score : payload.cibil_score;
  if (typeof rawExactScore === 'number' && !isNaN(rawExactScore)) {
    exactScore = rawExactScore;
  } else if (typeof rawExactScore === 'string' && rawExactScore.trim()) {
    const parsed = parseInt(rawExactScore.trim(), 10);
    if (!isNaN(parsed) && parsed > 0) exactScore = parsed;
  }

  // 4. Monthly Income (Supports COAPPLICANT_MONTHLY_INCOME_PRE__c & COAPP_MONTHLY_INCOME_PRE__c)
  let monthlyIncome = null;
  const rawIncome =
    payload.COAPPLICANT_MONTHLY_INCOME_PRE__c !== undefined && payload.COAPPLICANT_MONTHLY_INCOME_PRE__c !== null && payload.COAPPLICANT_MONTHLY_INCOME_PRE__c !== ''
      ? payload.COAPPLICANT_MONTHLY_INCOME_PRE__c
      : (payload.COAPP_MONTHLY_INCOME_PRE__c !== undefined && payload.COAPP_MONTHLY_INCOME_PRE__c !== null && payload.COAPP_MONTHLY_INCOME_PRE__c !== ''
          ? payload.COAPP_MONTHLY_INCOME_PRE__c
          : (emp.monthly_income !== undefined && emp.monthly_income !== null && emp.monthly_income !== ''
              ? emp.monthly_income
              : null));

  if (rawIncome !== null && rawIncome !== '') {
    const parsed = parseFloat(rawIncome);
    if (!isNaN(parsed)) {
      monthlyIncome = parsed;
    }
  }

  // 5. Co-Applicant Age (Supports Co_Applicant_age_pre__c)
  let age = null;
  const rawAge =
    payload.Co_Applicant_age_pre__c !== undefined && payload.Co_Applicant_age_pre__c !== null && payload.Co_Applicant_age_pre__c !== ''
      ? payload.Co_Applicant_age_pre__c
      : (coApp.age !== undefined && coApp.age !== null && coApp.age !== ''
          ? coApp.age
          : null);

  if (rawAge !== null && rawAge !== '') {
    const parsed = parseInt(rawAge, 10);
    if (!isNaN(parsed)) {
      age = parsed;
    }
  }

  // 6. Relationship (Supports RELATION_WITH_THE_COAPPLICANT_PRE__c)
  const rawRelation =
    payload.RELATION_WITH_THE_COAPPLICANT_PRE__c ||
    coApp.relation ||
    payload.relation ||
    '';
  const normalizedRelation = normalizeRelationship(rawRelation);

  // 7. Occupation (Supports Co_Applicant_Occupation_PRE__c)
  const rawOcc =
    payload.Co_Applicant_Occupation_PRE__c ||
    emp.occupation ||
    payload.occupation ||
    '';
  const normalizedOccupation = {
    raw: rawOcc.trim(),
    code: rawOcc.trim().toUpperCase().replace(/\s+/g, '_'),
    is_unspecified: !rawOcc || rawOcc.trim() === ''
  };

  // 8. Bank (Supports Co_Applicant_s_Bank_Name_PRE__c)
  const rawBank =
    payload.Co_Applicant_s_Bank_Name_PRE__c ||
    bank.bank_name ||
    payload.bank_name ||
    '';
  const classifiedBank = classifyBank(rawBank);

  // 9. State & City Location (Supports Co_Applicant_state_pre__c)
  let state =
    payload.Co_Applicant_state_pre__c ||
    coApp.state ||
    addr.state ||
    user.state ||
    '';
  let city =
    payload.Co_Applicant_city_pre__c ||
    coApp.city ||
    addr.city ||
    user.city ||
    '';

  const location = {
    state: state ? state.trim() : null,
    city: city ? city.trim() : null,
    source: payload.Co_Applicant_state_pre__c ? 'SALESFORCE_COAPP_FIELD' : (coApp.state ? 'CO_APPLICANT' : 'ADDRESS_DETAILS')
  };

  // 10. Parameter Questions
  const hasExplicitQuestions = Boolean(parameterQuestions || payload.parameter_questions);
  const qSource = parameterQuestions || payload.parameter_questions || {};
  const questions = {
    is_skipped: !hasExplicitQuestions,
    is_pan_aadhaar_linked: qSource.is_pan_aadhaar_linked !== undefined
      ? Boolean(qSource.is_pan_aadhaar_linked)
      : undefined,
    has_e_pan_or_physical_pan: qSource.has_e_pan_or_physical_pan !== undefined
      ? Boolean(qSource.has_e_pan_or_physical_pan)
      : undefined,
    has_dob_mismatch: qSource.has_dob_mismatch !== undefined
      ? Boolean(qSource.has_dob_mismatch)
      : undefined,
    has_name_mismatch: qSource.has_name_mismatch !== undefined
      ? Boolean(qSource.has_name_mismatch)
      : undefined,
    has_door_number: qSource.has_door_number !== undefined
      ? Boolean(qSource.has_door_number)
      : (addr.door_number || coApp.door_number ? true : undefined)
  };

  return {
    userApplicantId,
    salesforceId,
    name,
    cibil: {
      exact_score: exactScore,
      range_string: rangeString
    },
    monthlyIncome,
    age,
    relation: normalizedRelation,
    occupation: normalizedOccupation,
    bank: classifiedBank,
    location,
    questions,
    tenure: payload.selected_emi_tenure || 36,
    requestedLoanAmount: payload.requested_loan_amount || null
  };
}

module.exports = {
  normalizeApplicant
};
