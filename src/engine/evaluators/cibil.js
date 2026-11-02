/**
 * 3-Valued CIBIL Score and Range Evaluator
 * Evaluates applicant against lender's CIBIL threshold using strict interval logic:
 * - PASS: Entire range meets or exceeds lender threshold.
 * - FAIL: Entire range is below lender threshold.
 * - UNKNOWN: Range straddles the threshold, or score is missing/NTC (request exact bureau report).
 */

function evaluateCibil(cibilObj, lenderCriteria, lenderPolicy = {}) {
  const threshold = lenderCriteria.cibil_min || 650;

  // 1. Exact numeric CIBIL score provided
  if (cibilObj && typeof cibilObj.exact_score === 'number' && !isNaN(cibilObj.exact_score)) {
    const score = cibilObj.exact_score;
    if (score < 300 || score > 900) {
      return {
        status: 'FAIL',
        reason_code: 'INVALID_CIBIL_SCORE',
        detail: `CIBIL score ${score} is outside the valid bureau range (300 - 900).`,
        required: threshold,
        actual: score
      };
    }

    if (score >= threshold) {
      return {
        status: 'PASS',
        matched: `CIBIL score (${score} >= ${threshold})`,
        score: score
      };
    } else {
      return {
        status: 'FAIL',
        reason_code: 'CIBIL_BELOW_MINIMUM',
        detail: `CIBIL score (${score}) is below required minimum (${threshold}).`,
        required: threshold,
        actual: score
      };
    }
  }

  // 2. Range or string evaluation
  const rawRange = (cibilObj && cibilObj.range_string) ? cibilObj.range_string.trim() : '';

  if (!rawRange) {
    return {
      status: 'UNKNOWN',
      reason_code: 'CIBIL_REPORT_MISSING',
      detail: 'Credit score is missing or unverified.',
      missing_requirement: 'CIBIL bureau report or exact score'
    };
  }

  const lowerRaw = rawRange.toLowerCase();

  // 3. New To Credit / "No CIBIL Score" / "-1" / "0"
  if (lowerRaw.includes('no cibil') || lowerRaw === 'ntc' || lowerRaw === '-1' || lowerRaw === '0') {
    // Check if lender has explicit NTC policy approved
    if (lenderPolicy.allows_ntc === true) {
      return {
        status: 'PASS',
        matched: 'New to Credit (NTC) accepted by lender policy'
      };
    } else if (lenderPolicy.allows_ntc === false) {
      return {
        status: 'FAIL',
        reason_code: 'NTC_NOT_ACCEPTED',
        detail: 'Applicants without established credit history (NTC) are not eligible for this lender.',
        required: `CIBIL >= ${threshold}`
      };
    } else {
      // No approved policy: return UNKNOWN
      return {
        status: 'UNKNOWN',
        reason_code: 'EXACT_BUREAU_REQUIRED_NTC',
        detail: 'Applicant has no credit score on file; lender requires bureau pull or surrogate assessment.',
        missing_requirement: 'Credit Bureau verification report'
      };
    }
  }

  // 4. Numeric Range Parsing: "300 - 649", "650 - 699", "700 - 900", etc.
  const rangeMatch = rawRange.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (rangeMatch) {
    const low = parseInt(rangeMatch[1], 10);
    const high = parseInt(rangeMatch[2], 10);

    // Entire range meets threshold
    if (low >= threshold) {
      return {
        status: 'PASS',
        matched: `CIBIL range ${rawRange} meets minimum requirement (${threshold})`,
        range: [low, high]
      };
    }

    // Entire range below threshold
    if (high < threshold) {
      return {
        status: 'FAIL',
        reason_code: 'CIBIL_RANGE_BELOW_MINIMUM',
        detail: `CIBIL bracket '${rawRange}' (max ${high}) is below required minimum (${threshold}).`,
        required: threshold,
        actual: rawRange
      };
    }

    // Range crosses the threshold (e.g. 700-900 with threshold 711, or 650-699 with threshold 651)
    return {
      status: 'UNKNOWN',
      reason_code: 'NEEDS_EXACT_CIBIL_SCORE',
      detail: `CIBIL bracket '${rawRange}' straddles lender cutoff (${threshold}). Exact bureau score required.`,
      missing_requirement: `Exact CIBIL score (must be >= ${threshold})`,
      range: [low, high]
    };
  }

  // Unrecognized format
  return {
    status: 'UNKNOWN',
    reason_code: 'CIBIL_FORMAT_UNRECOGNIZED',
    detail: `Unrecognized CIBIL format '${rawRange}'. Requires credit verification.`,
    missing_requirement: 'Verified credit score'
  };
}

module.exports = {
  evaluateCibil
};
