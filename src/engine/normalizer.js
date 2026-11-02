/**
 * Applicant Data Normalizer & Attribute Extractor
 * Supports multiple enterprise payload schemas:
 * 1. "New Academy Co - Applicant NBFC Report" Schema:
 *    - userId
 *    - Academy PRE -Loan Journey Name
 *    - Choose NBFC / NBFC Onboarding Name
 *    - CIBIL Score Range
 *    - Relation with the Co-Applicant
 *    - Co applicant Occupation / Co-Applicant Occupation Other
 *    - Co-Applicant Age
 *    - State
 *    - Co-Applicant Monthly Income / Co-Applicant Monthly Income Value
 *    - Current Team
 * 2. Flat Salesforce SOQL Schema:
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
 * 3. Nested Microservice Schema (co_applicant_details, cibil_details, etc.)
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
  const salesforceId =
    payload.Id ||
    payload.salesforce_id ||
    user.salesforce_id ||
    payload['NBFC Onboarding Name'] ||
    null;

  const userApplicantId =
    payload.userId ||
    payload['Academy_Onboarding_PRE__r.userId__c'] ||
    payload.Academy_Onboarding_PRE__r?.userId__c ||
    payload.userId__c ||
    user.user_id ||
    coApp.user_applicant_id ||
    payload.user_id ||
    'unspecified-user';

  // 2. Applicant Name
  const name =
    payload['Academy PRE -Loan Journey Name'] ||
    payload.Name ||
    coApp.name ||
    payload.name ||
    'Applicant';

  // 3. CIBIL score extraction (Supports "CIBIL Score Range" & "CIBIL_SCORE_RANGE_PRE__c")
  let exactScore = null;
  let rangeString = null;

  const rawRange =
    payload['CIBIL Score Range'] ||
    payload.CIBIL_SCORE_RANGE_PRE__c ||
    cibil.cibil_score_range ||
    payload.cibil_score_range ||
    null;

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

  // 4. Monthly Income
  let monthlyIncome = null;
  const rawIncome =
    payload['Co-Applicant Monthly Income'] !== undefined && payload['Co-Applicant Monthly Income'] !== null && payload['Co-Applicant Monthly Income'] !== ''
      ? payload['Co-Applicant Monthly Income']
      : (payload['Co-Applicant Monthly Income Value'] !== undefined && payload['Co-Applicant Monthly Income Value'] !== null && payload['Co-Applicant Monthly Income Value'] !== ''
          ? payload['Co-Applicant Monthly Income Value']
          : (payload.COAPPLICANT_MONTHLY_INCOME_PRE__c !== undefined && payload.COAPPLICANT_MONTHLY_INCOME_PRE__c !== null && payload.COAPPLICANT_MONTHLY_INCOME_PRE__c !== ''
              ? payload.COAPPLICANT_MONTHLY_INCOME_PRE__c
              : (payload.COAPP_MONTHLY_INCOME_PRE__c !== undefined && payload.COAPP_MONTHLY_INCOME_PRE__c !== null && payload.COAPP_MONTHLY_INCOME_PRE__c !== ''
                  ? payload.COAPP_MONTHLY_INCOME_PRE__c
                  : (emp.monthly_income !== undefined && emp.monthly_income !== null && emp.monthly_income !== ''
                      ? emp.monthly_income
                      : null))));

  if (rawIncome !== null && rawIncome !== '') {
    const parsed = parseFloat(rawIncome);
    if (!isNaN(parsed)) {
      monthlyIncome = parsed;
    }
  }

  // 5. Co-Applicant Age
  let age = null;
  const rawAge =
    payload['Co-Applicant Age'] !== undefined && payload['Co-Applicant Age'] !== null && payload['Co-Applicant Age'] !== ''
      ? payload['Co-Applicant Age']
      : (payload.Co_Applicant_age_pre__c !== undefined && payload.Co_Applicant_age_pre__c !== null && payload.Co_Applicant_age_pre__c !== ''
          ? payload.Co_Applicant_age_pre__c
          : (coApp.age !== undefined && coApp.age !== null && coApp.age !== ''
              ? coApp.age
              : null));

  if (rawAge !== null && rawAge !== '') {
    const parsed = parseInt(rawAge, 10);
    if (!isNaN(parsed)) {
      age = parsed;
    }
  }

  // 6. Relationship
  const rawRelation =
    payload['Relation with the Co-Applicant'] ||
    payload.RELATION_WITH_THE_COAPPLICANT_PRE__c ||
    coApp.relation ||
    payload.relation ||
    '';
  const normalizedRelation = normalizeRelationship(rawRelation);

  // 7. Occupation
  const rawOcc =
    payload['Co applicant Occupation'] ||
    payload['Co-Applicant Occupation Other'] ||
    payload.Co_Applicant_Occupation_PRE__c ||
    emp.occupation ||
    payload.occupation ||
    '';
  const normalizedOccupation = {
    raw: rawOcc.trim(),
    code: rawOcc.trim().toUpperCase().replace(/\s+/g, '_'),
    is_unspecified: !rawOcc || rawOcc.trim() === ''
  };

  // 8. Bank (In this sheet, bank is unspecified or defaults to generic unless provided)
  const rawBank =
    payload['Co-Applicant Bank Name'] ||
    payload.Co_Applicant_s_Bank_Name_PRE__c ||
    bank.bank_name ||
    payload.bank_name ||
    '';
  const classifiedBank = classifyBank(rawBank);

  // 9. State & City Location
  let state =
    payload.State ||
    payload.Co_Applicant_state_pre__c ||
    coApp.state ||
    addr.state ||
    user.state ||
    '';
  let city =
    payload.City ||
    payload.Co_Applicant_city_pre__c ||
    coApp.city ||
    addr.city ||
    user.city ||
    '';

  const location = {
    state: state ? state.trim() : null,
    city: city ? city.trim() : null,
    source: payload.State ? 'REPORT_STATE' : (payload.Co_Applicant_state_pre__c ? 'SALESFORCE_COAPP_FIELD' : (coApp.state ? 'CO_APPLICANT' : 'ADDRESS_DETAILS'))
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

  // 11. Historical Ground Truth Chosen NBFC (for accuracy audit)
  const chosenNbfc = payload['Choose NBFC'] || payload['NBFC Onboarding Name'] || null;

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
    requestedLoanAmount: payload.requested_loan_amount || null,
    chosenNbfc
  };
}

module.exports = {
  normalizeApplicant
};
