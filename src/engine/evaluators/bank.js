/**
 * 4-Valued Bank Policy Evaluator v2.2
 * Evaluates bank classification (PSU, Private, RRB, Co-op, Other) against lender acceptance criteria.
 *
 * Distinguishes:
 * - Public Sector / Nationalised Banks (PSU) -> universally accepted
 * - Scheduled Commercial Private Banks (HDFC, ICICI, Axis, Kotak, Federal, etc.) -> accepted by standard retail lenders
 * - Regional Rural Banks (RRB / Grameen) -> accepted by lenders supporting UPI / physical NACH (Bajaj, Fibe)
 * - Co-operative Banks (Co-op) -> restricted by institutional lenders
 * - Unlisted / OTHER -> routes to CONDITIONAL bank verification rather than automatic hard failure
 */

function evaluateBank(classifiedBank, lenderCriteria = {}) {
  const privateBankAccepted = lenderCriteria.private_bank_accepted !== false;
  const cooperativeAccepted = lenderCriteria.cooperative_bank_accepted === true;
  const rrbAccepted = lenderCriteria.rrb_accepted !== undefined ? lenderCriteria.rrb_accepted : true;
  const nonNationalisedAccepted = lenderCriteria.non_nationalised_bank_accepted !== false;

  // 1. Bank is completely missing/unspecified (null / empty)
  if (!classifiedBank || classifiedBank.raw === null || classifiedBank.raw === undefined || classifiedBank.raw === '') {
    if (!nonNationalisedAccepted) {
      return {
        status: 'UNKNOWN',
        reason_code: 'BANK_VERIFICATION_REQUIRED',
        detail: 'Lender mandates account verification. Bank details must be verified.',
        missing_requirement: 'Bank account details'
      };
    }
    return {
      status: 'PASS',
      matched: 'Bank details pending mandate setup'
    };
  }

  // 2. Bank is 'OTHER' or Unlisted
  if (classifiedBank.code === 'OTHER' || classifiedBank.category === 'UNKNOWN') {
    if (nonNationalisedAccepted) {
      return {
        status: 'PASS',
        matched: `Bank '${classifiedBank.raw}' accepted under open bank policy`,
        bank_name: classifiedBank.raw
      };
    }
    // For lenders with specific bank restrictions, unlisted bank requires verification (CONDITIONAL, not hard FAIL)
    return {
      status: 'UNKNOWN',
      reason_code: 'BANK_VERIFICATION_REQUIRED',
      detail: `Bank account '${classifiedBank.raw}' requires bank statement & mandate verification with lender.`,
      missing_requirement: `Bank statement & NACH verification for '${classifiedBank.raw}'`,
      bank_name: classifiedBank.raw
    };
  }

  const category = classifiedBank.category;

  // 3. Public Sector / Nationalised Banks -> Always PASS
  if (category === 'PUBLIC_SECTOR' || classifiedBank.is_nationalised === true) {
    return {
      status: 'PASS',
      matched: `Public sector bank '${classifiedBank.name}' is accepted`,
      bank_name: classifiedBank.name,
      bank_category: category
    };
  }

  // 4. Scheduled Commercial Private Banks (HDFC, ICICI, Axis, Kotak, Federal, etc.)
  if (category === 'PRIVATE_SECTOR') {
    if (privateBankAccepted) {
      return {
        status: 'PASS',
        matched: `Scheduled commercial private bank '${classifiedBank.name}' is accepted`,
        bank_name: classifiedBank.name,
        bank_category: category
      };
    }
    return {
      status: 'FAIL',
      reason_code: 'PRIVATE_BANK_NOT_ACCEPTED',
      detail: `Private sector bank '${classifiedBank.name}' is not accepted by this lender.`,
      bank_name: classifiedBank.name,
      bank_category: category
    };
  }

  // 5. Regional Rural Banks (RRB / Grameen)
  if (category === 'REGIONAL_RURAL') {
    if (rrbAccepted === true) {
      return {
        status: 'PASS',
        matched: `Regional rural bank '${classifiedBank.name}' accepted via UPI / Grameen mandate`,
        bank_name: classifiedBank.name,
        bank_category: category
      };
    } else if (rrbAccepted === false) {
      return {
        status: 'FAIL',
        reason_code: 'REGIONAL_RURAL_BANK_NOT_ACCEPTED',
        detail: `Regional rural bank '${classifiedBank.name}' is not accepted by this lender.`,
        bank_name: classifiedBank.name,
        bank_category: category
      };
    } else {
      return {
        status: 'UNKNOWN',
        reason_code: 'RRB_MANDATE_VERIFICATION_REQUIRED',
        detail: `Regional rural bank '${classifiedBank.name}' requires verification of branch NACH / UPI feasibility.`,
        missing_requirement: `Branch NACH verification for ${classifiedBank.name}`,
        bank_name: classifiedBank.name,
        bank_category: category
      };
    }
  }

  // 6. Co-operative Banks (Co-op)
  if (category === 'COOPERATIVE') {
    if (cooperativeAccepted) {
      return {
        status: 'PASS',
        matched: `Co-operative bank '${classifiedBank.name}' accepted under exception policy`,
        bank_name: classifiedBank.name,
        bank_category: category
      };
    }
    return {
      status: 'FAIL',
      reason_code: 'COOPERATIVE_BANK_NOT_ACCEPTED',
      detail: `Co-operative bank '${classifiedBank.name}' is not accepted by this lender.`,
      bank_name: classifiedBank.name,
      bank_category: category
    };
  }

  return {
    status: 'PASS',
    matched: `Bank '${classifiedBank.name}' accepted by lender policy`,
    bank_name: classifiedBank.name,
    bank_category: category
  };
}

module.exports = {
  evaluateBank
};
