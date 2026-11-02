/**
 * 3-Valued Income and Age Boundary Evaluator
 * Engine v2.3.0
 * 
 * Supports:
 * - Configurable prime thresholds, base underwriting floors
 * - High declared income anomaly detection (> ₹2,00,000 / month) requiring ITR/salary slip verification
 * - Senior age exception bands and minor (< 18) disqualification
 */

function evaluateIncome(monthlyIncome, lenderCriteria, applicantContext = {}) {
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

  // Hard floor failure: Below minimum required underwriting floor
  if (income < hardMin) {
    return {
      status: 'FAIL',
      reason_code: 'MINIMUM_INCOME_NOT_MET',
      detail: `Monthly income ₹${income.toLocaleString('en-IN')} is below required minimum ₹${hardMin.toLocaleString('en-IN')}.`,
      required: hardMin,
      actual: income
    };
  }

  // Anomaly check: Unusually high income (>= ₹2,00,000 / month)
  // Flags cases where annual income was entered as monthly or executive income needs proof
  if (income >= 200000 && !applicantContext.hasDocumentedException) {
    return {
      status: 'UNKNOWN',
      reason_code: 'HIGH_INCOME_VERIFICATION_REQUIRED',
      detail: `Declared monthly income ₹${income.toLocaleString('en-IN')} is unusually high (>= ₹2,00,000); requires verified 3-month salary slips / Form 16 / ITR to confirm monthly vs annual income.`,
      missing_requirement: `Verified 3-month salary slips / Form 16 / ITR for income ₹${income.toLocaleString('en-IN')}`,
      actual: income,
      is_high_income_flag: true
    };
  }

  // Soft review floor: Above hard floor, but below prime criteria (requires bank statement AMB check)
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

function evaluateAge(rawAge, lenderCriteria, applicantContext = {}) {
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

  // Legal Minor check: Under 18 cannot be legal co-applicant
  if (age < 18) {
    return {
      status: 'FAIL',
      reason_code: 'MINOR_COAPPLICANT_PROHIBITED',
      detail: `Co-applicant age ${age} is below legal majority (18 years). Minors cannot act as financial co-applicants.`,
      required: 18,
      actual: age
    };
  }

  // Underage for lender-specific criteria
  if (age < minAllowed) {
    return {
      status: 'FAIL',
      reason_code: 'COAPPLICANT_UNDERAGE',
      detail: `Co-applicant age ${age} is below minimum requirement (${minAllowed} years).`,
      required: minAllowed,
      actual: age
    };
  }

  // Exceeds absolute senior maximum limit
  if (age > maxSeniorException) {
    return {
      status: 'FAIL',
      reason_code: 'AGE_EXCEEDS_MAX_LIMIT',
      detail: `Co-applicant age ${age} exceeds lender maximum limit (${maxSeniorException} years).`,
      required: maxSeniorException,
      actual: age
    };
  }

  // In senior exception band: age between maxSalaried and maxSeniorException
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
