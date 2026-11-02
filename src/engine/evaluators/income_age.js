/**
 * 3-Valued Income and Age Boundary Evaluator
 * Supports configurable prime thresholds, base underwriting floors, and senior age exception bands.
 * Enforces explicit UNKNOWN states on missing attributes and conditional review bands.
 */

function evaluateIncome(monthlyIncome, lenderCriteria) {
  const primeMin = lenderCriteria.monthly_income_min !== undefined
    ? lenderCriteria.monthly_income_min
    : 15000;
  const hardMin = lenderCriteria.monthly_income_hard_min !== undefined
    ? lenderCriteria.monthly_income_hard_min
    : primeMin;

  if (monthlyIncome === null || monthlyIncome === undefined || isNaN(monthlyIncome)) {
    return {
      status: 'UNKNOWN',
      reason_code: 'INCOME_MISSING',
      detail: 'Monthly income is not provided or unverified.',
      missing_requirement: `Proof of monthly income (minimum ₹${primeMin.toLocaleString('en-IN')})`
    };
  }

  const income = parseFloat(monthlyIncome);

  if (income < hardMin) {
    return {
      status: 'FAIL',
      reason_code: 'MINIMUM_INCOME_NOT_MET',
      detail: `Monthly income ₹${income.toLocaleString('en-IN')} is below required minimum ₹${hardMin.toLocaleString('en-IN')}.`,
      required: hardMin,
      actual: income
    };
  }

  if (income < primeMin) {
    return {
      status: 'UNKNOWN',
      reason_code: 'INCOME_VERIFICATION_REQUIRED',
      detail: `Monthly income ₹${income.toLocaleString('en-IN')} is below prime threshold (₹${primeMin.toLocaleString('en-IN')}); conditional approval subject to bank statement / ITR verification.`,
      missing_requirement: `Bank statement / income verification for income ₹${income.toLocaleString('en-IN')}`,
      prime_required: primeMin,
      hard_minimum: hardMin,
      actual: income
    };
  }

  return {
    status: 'PASS',
    matched: `Monthly income ₹${income.toLocaleString('en-IN')} meets required ₹${primeMin.toLocaleString('en-IN')}`,
    actual: income
  };
}

function evaluateAge(rawAge, lenderCriteria) {
  const maxSalaried = lenderCriteria.age_max || 58;
  const maxSeniorException = lenderCriteria.age_max_with_exception || maxSalaried;
  const minAllowed = lenderCriteria.age_min || 21;

  if (rawAge === null || rawAge === undefined || rawAge === '') {
    return {
      status: 'UNKNOWN',
      reason_code: 'AGE_MISSING',
      detail: 'Co-applicant age is missing from application.',
      missing_requirement: `Co-applicant Date of Birth / verified age (allowed range: ${minAllowed} - ${maxSalaried} yrs)`
    };
  }

  const age = parseInt(rawAge, 10);
  if (isNaN(age)) {
    return {
      status: 'UNKNOWN',
      reason_code: 'AGE_INVALID',
      detail: `Invalid age format '${rawAge}'.`,
      missing_requirement: 'Co-applicant verified age'
    };
  }

  if (age < minAllowed) {
    return {
      status: 'FAIL',
      reason_code: 'COAPPLICANT_UNDERAGE',
      detail: `Co-applicant age ${age} is below minimum requirement (${minAllowed} years).`,
      required: minAllowed,
      actual: age
    };
  }

  if (age > maxSeniorException) {
    return {
      status: 'FAIL',
      reason_code: 'AGE_EXCEEDS_MAX_LIMIT',
      detail: `Co-applicant age ${age} exceeds lender maximum limit (${maxSeniorException} years).`,
      required: maxSeniorException,
      actual: age
    };
  }

  if (age > maxSalaried) {
    return {
      status: 'UNKNOWN',
      reason_code: 'SENIOR_COAPPLICANT_REVIEW',
      detail: `Co-applicant age ${age} exceeds prime salaried limit (${maxSalaried} yrs); permissible under senior co-applicant exception (<= ${maxSeniorException} yrs) subject to loan maturity before age ${maxSeniorException}.`,
      missing_requirement: `Senior co-applicant loan tenure and retirement verification (Age ${age})`,
      salaried_limit: maxSalaried,
      exception_limit: maxSeniorException,
      actual: age
    };
  }

  return {
    status: 'PASS',
    matched: `Co-applicant age (${age} years) within permissible bracket [${minAllowed} - ${maxSalaried}]`,
    actual: age
  };
}

module.exports = {
  evaluateIncome,
  evaluateAge
};
