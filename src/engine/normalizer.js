/**
 * Applicant Data Normalizer & Attribute Extractor
 * Engine v2.3.0 Production Architecture
 * 
 * Provides strict input parsing:
 * - Currency strings (₹25,000, 25,000, etc.)
 * - Boolean string conversions ("false" -> false, "true" -> true)
 * - Anomaly detection for unusually high monthly incomes (> ₹2,00,000)
 * - Co-applicant age bound detection (minor < 18, senior > 65)
 * - Multi-attempt tracking (UID vs Application / Loan Journey attempt)
 */

const { normalizeRelationship } = require('../config/relationship_map');
const { classifyBank } = require('../config/bank_registry');

/**
 * Strict currency and number parsing
 * Handles "₹25,000", "25,000", "₹ 1,40,000/-", numbers, etc.
 */
function parseCurrency(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    return isFinite(val) ? val : null;
  }
  if (typeof val === 'string') {
    const cleaned = val
      .replace(/[₹RsINR\/\-\s]/gi, '')
      .replace(/,/g, '')
      .trim();
    if (!cleaned) return null;
    const parsed = parseFloat(cleaned);
    return !isNaN(parsed) && isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Strict boolean parser
 * Prevents "false" string from evaluating to true
 */
function parseStrictBoolean(val) {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    if (s === 'true' || s === 'yes' || s === '1' || s === 'y') return true;
    if (s === 'false' || s === 'no' || s === '0' || s === 'n') return false;
  }
  return undefined;
}

/**
 * Strict integer age parser
 */
function parseStrictAge(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    return Number.isInteger(val) ? val : Math.floor(val);
  }
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^\d]/g, '').trim();
    if (!cleaned) return null;
    const parsed = parseInt(cleaned, 10);
    return !isNaN(parsed) ? parsed : null;
  }
  return null;
}

function normalizeApplicant(payload = {}, parameterQuestions = null) {
  const coApp = payload.co_applicant_details || {};
  const cibil = payload.cibil_details || {};
  const emp = payload.employment_details || {};
  const bank = payload.bank_details || {};
  const addr = payload.address_details || {};
  const user = payload.user_details || {};

  // 1. Identifiers & Application History Tracking
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

  const applicationId =
    payload.application_id ||
    payload['Application Id'] ||
    payload['Academy PRE -Loan Journey Name'] ||
    payload.Name ||
    null;

  const attemptId =
    payload.attempt_id ||
    payload['Attempt ID'] ||
    payload.submission_attempt ||
    null;

  // 2. Applicant Name
  const name =
    payload['Academy PRE -Loan Journey Name'] ||
    payload.Name ||
    coApp.name ||
    payload.name ||
    'Applicant';

  // 3. CIBIL score extraction
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

  // 4. Monthly Income with strict currency parsing
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

  monthlyIncome = parseCurrency(rawIncome);

  // Anomaly check: Unusually high income (> ₹2,00,000 / month)
  // Flag as potential annual figure entered as monthly or executive income requiring ITR verification
  const isUnusuallyHighIncome = typeof monthlyIncome === 'number' && monthlyIncome >= 200000;

  // 5. Co-Applicant Age with strict parsing & bound anomaly check
  const rawAge =
    payload['Co-Applicant Age'] !== undefined && payload['Co-Applicant Age'] !== null && payload['Co-Applicant Age'] !== ''
      ? payload['Co-Applicant Age']
      : (payload.Co_Applicant_age_pre__c !== undefined && payload.Co_Applicant_age_pre__c !== null && payload.Co_Applicant_age_pre__c !== ''
          ? payload.Co_Applicant_age_pre__c
          : (coApp.age !== undefined && coApp.age !== null && coApp.age !== ''
              ? coApp.age
              : null));

  const age = parseStrictAge(rawAge);
  const isMinor = typeof age === 'number' && age < 18;
  const isSenior = typeof age === 'number' && age > 65;

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

  // 8. Bank (Normalized via bank registry)
  const rawBank =
    payload["Co-Applicant's Bank Name"] ||
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

  // 10. Parameter Questions with strict boolean parsing
  const hasExplicitQuestions = Boolean(parameterQuestions || payload.parameter_questions);
  const qSource = parameterQuestions || payload.parameter_questions || {};
  const questions = {
    is_skipped: !hasExplicitQuestions,
    is_pan_aadhaar_linked: parseStrictBoolean(qSource.is_pan_aadhaar_linked),
    has_e_pan_or_physical_pan: parseStrictBoolean(qSource.has_e_pan_or_physical_pan),
    has_physical_pan: parseStrictBoolean(qSource.has_physical_pan !== undefined ? qSource.has_physical_pan : qSource.has_e_pan_or_physical_pan),
    has_dob_mismatch: parseStrictBoolean(qSource.has_dob_mismatch),
    has_name_mismatch: parseStrictBoolean(qSource.has_name_mismatch),
    has_door_number: parseStrictBoolean(qSource.has_door_number) !== undefined
      ? parseStrictBoolean(qSource.has_door_number)
      : (addr.door_number || coApp.door_number ? true : undefined)
  };

  // 11. Documented exception flags (e.g. credit committee override)
  const hasDocumentedException = Boolean(
    payload.has_documented_exception ||
    payload.credit_committee_override ||
    payload.is_underwriting_override
  );

  // 12. Historical Ground Truth Chosen NBFC
  const chosenNbfc = payload['Choose NBFC'] || payload['NBFC Onboarding Name'] || null;

  return {
    userApplicantId,
    salesforceId,
    applicationId,
    attemptId,
    name,
    cibil: {
      exact_score: exactScore,
      range_string: rangeString
    },
    monthlyIncome,
    isUnusuallyHighIncome,
    age,
    isMinor,
    isSenior,
    relation: normalizedRelation,
    occupation: normalizedOccupation,
    bank: classifiedBank,
    location,
    questions,
    tenure: payload.selected_emi_tenure || 36,
    requestedLoanAmount: payload.requested_loan_amount || null,
    hasDocumentedException,
    chosenNbfc
  };
}

module.exports = {
  normalizeApplicant,
  parseCurrency,
  parseStrictBoolean,
  parseStrictAge
};
