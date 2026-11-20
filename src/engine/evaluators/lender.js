/**
 * Evaluates an applicant against a single NBFC lender's criteria using 4-state logic.
 * Engine v2.3.0
 * 
 * States:
 * - ELIGIBLE: All required preliminary eligibility rules are satisfied.
 * - CONDITIONAL: Potentially eligible, but additional information or verification is required.
 * - INELIGIBLE: Confirmed failure of an applicable lender eligibility rule.
 * - UNKNOWN: Insufficient or conflicting policy information to evaluate reliably.
 */

const { evaluateCibil } = require('./cibil');
const { evaluateIncome, evaluateAge } = require('./income_age');
const { evaluateRelationship } = require('./relationship');
const { evaluateOccupation } = require('./occupation');
const { evaluateBank } = require('./bank');
const { evaluateRegion } = require('./region');
const { evaluateIdentity } = require('./identity');
const { getDiscrepancies } = require('../../config/discrepancies');

function evaluateLender(applicant, partnerConfig, policyMetadata = {}) {
  const c = partnerConfig.criteria || {};
  const partnerId = partnerConfig.id;
  const partnerName = partnerConfig.name;
  const priority = partnerConfig.priority || 99;

  const rulesEvaluated = [];
  const matchedCriteria = [];
  const failures = [];
  const missingRequirements = [];
  const pendingVerifications = [];

  const discrepancies = getDiscrepancies(partnerId);
  const effectivePolicy = {
    ...(partnerConfig.policy || {}),
    ...(policyMetadata.settings || {})
  };

  // 1. CIBIL Evaluation
  const cibilResult = evaluateCibil(applicant.cibil, c, effectivePolicy, applicant);
  rulesEvaluated.push({
    rule_name: 'CIBIL_SCORE',
    status: cibilResult.status,
    detail: cibilResult.detail || cibilResult.matched
  });
  if (cibilResult.status === 'PASS') {
    matchedCriteria.push(cibilResult.matched || 'CIBIL criteria satisfied');
  } else if (cibilResult.status === 'FAIL') {
    failures.push({
      rule: 'CIBIL_SCORE',
      reason_code: cibilResult.reason_code,
      detail: cibilResult.detail,
      required: cibilResult.required,
      actual: cibilResult.actual
    });
  } else {
    missingRequirements.push(cibilResult.missing_requirement || 'CIBIL report required');
    pendingVerifications.push(cibilResult.detail);
  }

  // 2. Monthly Income Evaluation
  const incomeResult = evaluateIncome(applicant.monthlyIncome, c, applicant);
  rulesEvaluated.push({
    rule_name: 'MONTHLY_INCOME',
    status: incomeResult.status,
    detail: incomeResult.detail || incomeResult.matched
  });
  if (incomeResult.status === 'PASS') {
    matchedCriteria.push(incomeResult.matched);
  } else if (incomeResult.status === 'FAIL') {
    failures.push({
      rule: 'MONTHLY_INCOME',
      reason_code: incomeResult.reason_code,
      detail: incomeResult.detail,
      required: incomeResult.required,
      actual: incomeResult.actual
    });
  } else {
    missingRequirements.push(incomeResult.missing_requirement);
    if (incomeResult.detail) pendingVerifications.push(incomeResult.detail);
  }

  // 3. Age Evaluation
  const ageResult = evaluateAge(applicant.age, c, applicant);
  rulesEvaluated.push({
    rule_name: 'COAPPLICANT_AGE',
    status: ageResult.status,
    detail: ageResult.detail || ageResult.matched
  });
  if (ageResult.status === 'PASS') {
    matchedCriteria.push(ageResult.matched);
  } else if (ageResult.status === 'FAIL') {
    failures.push({
      rule: 'COAPPLICANT_AGE',
      reason_code: ageResult.reason_code,
      detail: ageResult.detail,
      required: ageResult.required,
      actual: ageResult.actual
    });
  } else {
    missingRequirements.push(ageResult.missing_requirement);
    if (ageResult.detail) pendingVerifications.push(ageResult.detail);
  }

  // 4. Relationship Evaluation
  const relResult = evaluateRelationship(applicant.relation, c);
  rulesEvaluated.push({
    rule_name: 'COAPPLICANT_RELATIONSHIP',
    status: relResult.status,
    detail: relResult.detail || relResult.matched
  });
  if (relResult.status === 'PASS') {
    matchedCriteria.push(relResult.matched);
  } else if (relResult.status === 'FAIL') {
    failures.push({
      rule: 'COAPPLICANT_RELATIONSHIP',
      reason_code: relResult.reason_code,
      detail: relResult.detail,
      allowed_relations: relResult.allowed_relations
    });
  } else {
    missingRequirements.push(relResult.missing_requirement);
    if (relResult.detail) pendingVerifications.push(relResult.detail);
  }

  // 5. Occupation Evaluation
  const occResult = evaluateOccupation(applicant.occupation, c);
  rulesEvaluated.push({
    rule_name: 'COAPPLICANT_OCCUPATION',
    status: occResult.status,
    detail: occResult.detail || occResult.matched
  });
  if (occResult.status === 'PASS') {
    matchedCriteria.push(occResult.matched);
  } else if (occResult.status === 'FAIL') {
    failures.push({
      rule: 'COAPPLICANT_OCCUPATION',
      reason_code: occResult.reason_code,
      detail: occResult.detail,
      restricted_occupation: occResult.restricted_occupation
    });
  } else {
    missingRequirements.push(occResult.missing_requirement);
  }

  // 6. Bank Classification Evaluation
  const bankResult = evaluateBank(applicant.bank, c);
  rulesEvaluated.push({
    rule_name: 'BANK_ACCOUNT_TYPE',
    status: bankResult.status,
    detail: bankResult.detail || bankResult.matched
  });
  if (bankResult.status === 'PASS') {
    matchedCriteria.push(bankResult.matched);
  } else if (bankResult.status === 'FAIL') {
    failures.push({
      rule: 'BANK_ACCOUNT_TYPE',
      reason_code: bankResult.reason_code,
      detail: bankResult.detail,
      bank_name: bankResult.bank_name,
      bank_category: bankResult.bank_category
    });
  } else {
    missingRequirements.push(bankResult.missing_requirement);
  }

  // 7. Regional Evaluation
  const regionResult = evaluateRegion(applicant.location, c);
  rulesEvaluated.push({
    rule_name: 'GEOGRAPHIC_REGION',
    status: regionResult.status,
    detail: regionResult.detail || regionResult.matched
  });
  if (regionResult.status === 'PASS') {
    matchedCriteria.push(regionResult.matched);
  } else if (regionResult.status === 'FAIL') {
    failures.push({
      rule: 'GEOGRAPHIC_REGION',
      reason_code: regionResult.reason_code,
      detail: regionResult.detail,
      restricted_state: regionResult.restricted_state
    });
  } else {
    missingRequirements.push(regionResult.missing_requirement);
  }

  // 8. Identity & Parameter Questions Evaluation
  const identityResult = evaluateIdentity(applicant.questions, c);
  rulesEvaluated.push({
    rule_name: 'IDENTITY_AND_DOCUMENT_VERIFICATION',
    status: identityResult.failures.length > 0 ? 'FAIL' : (identityResult.unknownRequirements.length > 0 ? 'UNKNOWN' : 'PASS'),
    detail: identityResult.failures.length > 0 ? identityResult.failures[0].detail : 'Identity checks satisfied'
  });
  identityResult.matched.forEach(m => matchedCriteria.push(m));
  identityResult.failures.forEach(f => failures.push(f));
  identityResult.unknownRequirements.forEach(u => {
    missingRequirements.push(u.missing_requirement);
  });

  // Decision Aggregation (Strict 4-State Logic)
  let classification = 'ELIGIBLE';
  let primaryReasonCode = 'CRITERIA_SATISFIED';
  let primaryReasonDetail = 'All mandatory underwriting criteria satisfied.';
  let recommendedNextAction = 'Proceed with loan application and document submission.';

  if (failures.length > 0) {
    classification = 'INELIGIBLE';
    primaryReasonCode = failures[0].reason_code;
    primaryReasonDetail = failures[0].detail;
    recommendedNextAction = `Applicant disqualified for ${partnerName}: ${failures[0].detail}. Route to alternative eligible partner.`;
  } else if (missingRequirements.length > 0) {
    classification = 'CONDITIONAL';
    primaryReasonCode = 'ADDITIONAL_DOCUMENTS_REQUIRED';
    primaryReasonDetail = `Lender requirements pending: ${missingRequirements.slice(0, 2).join('; ')}`;
    recommendedNextAction = `Collect pending documents: ${missingRequirements.slice(0, 2).join('; ')} to finalize eligibility.`;
  }

  // Reason codes collection
  const reasonCodes = [];
  if (primaryReasonCode) reasonCodes.push(primaryReasonCode);
  failures.forEach(f => {
    if (f.reason_code && !reasonCodes.includes(f.reason_code)) {
      reasonCodes.push(f.reason_code);
    }
  });

  // Verified inputs snapshot conforming to Section 5
  const verifiedInputs = {
    cibil_score: applicant.cibil ? applicant.cibil.exact_score : null,
    cibil_range: applicant.cibil ? applicant.cibil.range_string : null,
    monthly_income: applicant.monthlyIncome,
    is_unusually_high_income: applicant.isUnusuallyHighIncome || false,
    coapplicant_age: applicant.age,
    is_minor: applicant.isMinor || false,
    is_senior: applicant.isSenior || false,
    relationship: applicant.relation ? applicant.relation.canonical : null,
    occupation: applicant.occupation ? applicant.occupation.raw : null,
    bank_name: applicant.bank ? applicant.bank.name : null,
    bank_category: applicant.bank ? applicant.bank.category : null,
    state: applicant.location ? applicant.location.state : null
  };

  const policyVersion = policyMetadata.policy_version || '2.3.0';
  const algorithmVersion = '2.3.0';

  return {
    // Section 5 Required Architecture Schema
    nbfc: partnerName,
    decision: classification,
    reason_codes: reasonCodes,
    hard_blockers: failures.map(f => f.detail || f.reason_code),
    missing_requirements: missingRequirements,
    verified_inputs: verifiedInputs,
    policy_version: policyVersion,
    algorithm_version: algorithmVersion,
    recommended_next_action: recommendedNextAction,

    // Legacy and backwards-compatibility fields
    nbfc_code: (partnerConfig.code || partnerId).toUpperCase(),
    partner_id: partnerId,
    partner_name: partnerName,
    priority: priority,
    classification: classification,
    decision_status: classification,
    eligibility_status: classification,
    reason_code: primaryReasonCode,
    reason_detail: primaryReasonDetail,
    explanation: primaryReasonDetail,
    rules_evaluated: rulesEvaluated,
    input_values: verifiedInputs,
    pending_verifications: pendingVerifications,
    matched_criteria: matchedCriteria,
    failures: failures,
    effective_date: policyMetadata.effective_date || '2026-11-02',
    discrepancies: discrepancies.length > 0 ? discrepancies : undefined
  };
}

module.exports = {
  evaluateLender
};
