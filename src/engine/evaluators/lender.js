/**
 * Evaluates an applicant against a single NBFC lender's criteria using 3-valued logic.
 * Aggregation rules:
 * - Any mandatory FAIL -> INELIGIBLE
 * - No FAIL, but >=1 mandatory UNKNOWN -> CONDITIONAL
 * - All mandatory checks PASS -> ELIGIBLE
 */

const { evaluateCibil } = require('./cibil');
const { evaluateIncome, evaluateAge } = require('./income_age');
const { evaluateRelationship } = require('./relationship');
const { evaluateOccupation } = require('./occupation');
const { evaluateBank } = require('./bank');
const { evaluateRegion } = require('./region');
const { evaluateIdentity } = require('./identity');
const { getDiscrepancies } = require('../../config/discrepancies');

function evaluateLender(applicant, partnerConfig) {
  const c = partnerConfig.criteria || {};
  const partnerId = partnerConfig.id;
  const partnerName = partnerConfig.name;
  const priority = partnerConfig.priority || 99;

  const matchedCriteria = [];
  const failures = [];
  const missingRequirements = [];
  const pendingVerifications = [];

  // Check discrepancies
  const discrepancies = getDiscrepancies(partnerId);

  // 1. CIBIL Evaluation
  const cibilResult = evaluateCibil(applicant.cibil, c, partnerConfig.policy || {});
  if (cibilResult.status === 'PASS') {
    matchedCriteria.push(cibilResult.matched || 'CIBIL criteria satisfied');
  } else if (cibilResult.status === 'FAIL') {
    failures.push({
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
  const incomeResult = evaluateIncome(applicant.monthlyIncome, c);
  if (incomeResult.status === 'PASS') {
    matchedCriteria.push(incomeResult.matched);
  } else if (incomeResult.status === 'FAIL') {
    failures.push({
      reason_code: incomeResult.reason_code,
      detail: incomeResult.detail,
      required: incomeResult.required,
      actual: incomeResult.actual
    });
  } else {
    missingRequirements.push(incomeResult.missing_requirement);
  }

  // 3. Age Evaluation
  const ageResult = evaluateAge(applicant.age, c);
  if (ageResult.status === 'PASS') {
    matchedCriteria.push(ageResult.matched);
  } else if (ageResult.status === 'FAIL') {
    failures.push({
      reason_code: ageResult.reason_code,
      detail: ageResult.detail,
      required: ageResult.required,
      actual: ageResult.actual
    });
  } else {
    missingRequirements.push(ageResult.missing_requirement);
  }

  // 4. Relationship Evaluation
  const relResult = evaluateRelationship(applicant.relation, c);
  if (relResult.status === 'PASS') {
    matchedCriteria.push(relResult.matched);
  } else if (relResult.status === 'FAIL') {
    failures.push({
      reason_code: relResult.reason_code,
      detail: relResult.detail,
      canonical_relation: relResult.canonical,
      original_relation: relResult.original
    });
  } else {
    missingRequirements.push(relResult.missing_requirement);
  }

  // 5. Occupation Evaluation
  const occResult = evaluateOccupation(applicant.occupation, c);
  if (occResult.status === 'PASS') {
    matchedCriteria.push(occResult.matched);
  } else if (occResult.status === 'FAIL') {
    failures.push({
      reason_code: occResult.reason_code,
      detail: occResult.detail,
      occupation: occResult.occupation
    });
  } else {
    missingRequirements.push(occResult.missing_requirement);
  }

  // 6. Bank Policy Evaluation
  const bankResult = evaluateBank(applicant.bank, c);
  if (bankResult.status === 'PASS') {
    matchedCriteria.push(bankResult.matched);
  } else if (bankResult.status === 'FAIL') {
    failures.push({
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
  if (regionResult.status === 'PASS') {
    matchedCriteria.push(regionResult.matched);
  } else if (regionResult.status === 'FAIL') {
    failures.push({
      reason_code: regionResult.reason_code,
      detail: regionResult.detail,
      restricted_state: regionResult.restricted_state
    });
  } else {
    missingRequirements.push(regionResult.missing_requirement);
  }

  // 8. Identity & Parameter Questions Evaluation
  const identityResult = evaluateIdentity(applicant.questions, c);
  identityResult.matched.forEach(m => matchedCriteria.push(m));
  identityResult.failures.forEach(f => failures.push(f));
  identityResult.unknownRequirements.forEach(u => {
    missingRequirements.push(u.missing_requirement);
  });

  // Decision Aggregation
  let classification = 'ELIGIBLE';
  let primaryReasonCode = null;
  let primaryReasonDetail = null;

  if (failures.length > 0) {
    classification = 'INELIGIBLE';
    primaryReasonCode = failures[0].reason_code;
    primaryReasonDetail = failures[0].detail;
  } else if (missingRequirements.length > 0) {
    classification = 'CONDITIONAL';
    primaryReasonCode = 'ADDITIONAL_DOCUMENTS_REQUIRED';
    primaryReasonDetail = `Lender requirements pending: ${missingRequirements.slice(0, 2).join('; ')}`;
  }

  return {
    nbfc_code: (partnerConfig.code || partnerId).toUpperCase(),
    partner_id: partnerId,
    partner_name: partnerName,
    priority: priority,
    classification: classification,
    primary_reason_code: primaryReasonCode,
    primary_reason_detail: primaryReasonDetail,
    matched_criteria: matchedCriteria,
    failures: failures,
    missing_requirements: missingRequirements,
    pending_verifications: pendingVerifications,
    discrepancies: discrepancies.length > 0 ? discrepancies : undefined
  };
}

module.exports = {
  evaluateLender
};
