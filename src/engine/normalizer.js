/**
 * Applicant Data Normalizer & Attribute Extractor
 * Extracts 3-valued attributes without fabricating default 0 or truthy values.
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

  // 1. CIBIL score extraction
  let exactScore = null;
  let rangeString = null;

  if (typeof cibil.cibil_score === 'number' && !isNaN(cibil.cibil_score)) {
    exactScore = cibil.cibil_score;
  } else if (typeof cibil.cibil_score === 'string' && cibil.cibil_score.trim()) {
    const parsed = parseInt(cibil.cibil_score.trim(), 10);
    if (!isNaN(parsed) && parsed > 0) {
      exactScore = parsed;
    }
  }

  if (cibil.cibil_score_range && typeof cibil.cibil_score_range === 'string') {
    rangeString = cibil.cibil_score_range.trim();
  }

  // 2. Income extraction (Strict null preservation)
  let monthlyIncome = null;
  const rawIncome = emp.monthly_income !== undefined && emp.monthly_income !== null
    ? emp.monthly_income
    : (payload.coapplicant_monthly_income !== undefined ? payload.coapplicant_monthly_income : null);

  if (rawIncome !== null && rawIncome !== '') {
    const parsed = parseFloat(rawIncome);
    if (!isNaN(parsed)) {
      monthlyIncome = parsed;
    }
  }

  // 3. Age extraction (Strict null preservation)
  let age = null;
  const rawAge = coApp.age !== undefined && coApp.age !== null ? coApp.age : payload.coapplicant_age;
  if (rawAge !== null && rawAge !== '') {
    const parsed = parseInt(rawAge, 10);
    if (!isNaN(parsed)) {
      age = parsed;
    }
  }

  // 4. Relationship normalization
  const rawRelation = coApp.relation || payload.relation_with_coapplicant || '';
  const normalizedRelation = normalizeRelationship(rawRelation);

  // 5. Occupation & Employment
  const rawOcc = emp.occupation || payload.coapplicant_occupation || '';
  const normalizedOccupation = {
    raw: rawOcc.trim(),
    code: rawOcc.trim().toUpperCase().replace(/\s+/g, '_'),
    is_unspecified: !rawOcc || rawOcc.trim() === ''
  };

  // 6. Bank classification
  const rawBank = bank.bank_name || payload.coapplicant_bank_name || '';
  const classifiedBank = classifyBank(rawBank);

  // 7. Location with approved multi-tier fallback:
  // Tier 1: co-applicant location
  // Tier 2: verified address details
  // Tier 3: primary user location
  let state = coApp.state ? coApp.state.trim() : (addr.state ? addr.state.trim() : (user.state ? user.state.trim() : ''));
  let city = coApp.city ? coApp.city.trim() : (addr.city ? addr.city.trim() : (user.city ? user.city.trim() : ''));

  const location = {
    state: state || null,
    city: city || null,
    source: coApp.state ? 'CO_APPLICANT' : (addr.state ? 'ADDRESS_DETAILS' : (user.state ? 'PRIMARY_USER' : 'NONE'))
  };

  // 8. The 4 Verification Questions + Door Number
  // Keep undefined as undefined if not explicitly provided!
  const qSource = parameterQuestions || payload.parameter_questions || {};
  const questions = {
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

  // Identifiers
  const userApplicantId = coApp.user_applicant_id || user.user_id || payload.user_id || 'unspecified-user';
  const salesforceId = payload.salesforce_id || user.salesforce_id || payload.Id || null;

  return {
    userApplicantId,
    salesforceId,
    name: coApp.name || payload.name || 'Applicant',
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
