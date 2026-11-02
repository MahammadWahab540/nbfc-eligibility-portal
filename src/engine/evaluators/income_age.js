/**
 * 3-Valued Income and Age Boundary Evaluator
 * Enforces explicit UNKNOWN states on missing attributes rather than fabricating 0 values.
 */

function evaluateIncome(monthlyIncome, lenderCriteria) {
  const minRequired = lenderCriteria.monthly_income_min !== undefined
    ? lenderCriteria.monthly_income_min
    : 15000;

  if (monthlyIncome === null || monthlyIncome === undefined || isNaN(monthlyIncome)) {
    return {
      status: 'UNKNOWN',
      reason_code: 'INCOME_MISSING',
      detail: 'Monthly income is not provided or unverified.',
      missing_requirement: `Proof of monthly income (minimum ₹${minRequired.toLocaleString('en-IN')})`
    };
  }

  const income = parseFloat(monthlyIncome);

  if (income < minRequired) {
    return {
      status: 'FAIL',
      reason_code: 'MINIMUM_INCOME_NOT_MET',
      detail: `Monthly income ₹${income.toLocaleString('en-IN')} is below required ₹${minRequired.toLocaleString('en-IN')}.`,
      required: minRequired,
      actual: income
    };
  }

  return {
    status: 'PASS',
    matched: `Monthly income ₹${income.toLocaleString('en-IN')} meets required ₹${minRequired.toLocaleString('en-IN')}`,
    actual: income
  };
}

function evaluateAge(rawAge, lenderCriteria) {
  const maxAllowed = lenderCriteria.age_max || 58;
  const minAllowed = lenderCriteria.age_min || 21; // Standard lending co-borrower legal majority

  if (rawAge === null || rawAge === undefined || rawAge === '') {
    return {
      status: 'UNKNOWN',
      reason_code: 'AGE_MISSING',
      detail: 'Co-applicant age is missing from application.',
      missing_requirement: `Co-applicant Date of Birth / verified age (allowed range: ${minAllowed} - ${maxAllowed} yrs)`
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

  if (age > maxAllowed) {
    return {
      status: 'FAIL',
      reason_code: 'AGE_EXCEEDS_MAX_LIMIT',
      detail: `Co-applicant age ${age} exceeds lender maximum limit (${maxAllowed} years).`,
      required: maxAllowed,
      actual: age
    };
  }

  return {
    status: 'PASS',
    matched: `Co-applicant age (${age} years) within permissible bracket [${minAllowed} - ${maxAllowed}]`,
    actual: age
  };
}

module.exports = {
  evaluateIncome,
  evaluateAge
};
