/**
 * 3-Valued Bank Policy Evaluator
 * Evaluates bank classification (PSU, Private, RRB, Co-op, Other) against lender acceptance criteria.
 */

function evaluateBank(classifiedBank, lenderCriteria) {
  const nonNationalisedAccepted = lenderCriteria.non_nationalised_bank_accepted !== false;

  // 1. Bank is completely missing/unspecified (null / empty)
  if (!classifiedBank || classifiedBank.raw === null || classifiedBank.raw === undefined || classifiedBank.raw === '') {
    if (!nonNationalisedAccepted) {
      return {
        status: 'UNKNOWN',
        reason_code: 'BANK_VERIFICATION_REQUIRED',
        detail: 'Lender mandates a nationalised public sector bank account. Bank details must be verified.',
        missing_requirement: 'Nationalised bank account details'
      };
    }
    return {
      status: 'PASS',
      matched: 'Bank details pending mandate setup'
    };
  }

  // 2. Bank is 'OTHER'
  if (classifiedBank.code === 'OTHER' || classifiedBank.category === 'UNKNOWN') {
    if (!nonNationalisedAccepted) {
      // Lender requires nationalised bank, but applicant provided non-nationalised / OTHER bank
      return {
        status: 'FAIL',
        reason_code: 'NON_NATIONALISED_BANK_NOT_ACCEPTED',
        detail: `Non-nationalised/Co-operative bank '${classifiedBank.raw}' not accepted by this lender`,
        bank_name: classifiedBank.raw
      };
    }
    // Lender accepts other / non-nationalised banks
    return {
      status: 'PASS',
      matched: `Bank '${classifiedBank.raw}' accepted under non-nationalised bank policy`,
      bank_name: classifiedBank.raw
    };
  }

  // 3. Bank is specifically classified (PSU vs Private vs RRB vs Co-operative)
  const isNationalised = classifiedBank.is_nationalised === true || classifiedBank.category === 'PUBLIC_SECTOR';

  if (!nonNationalisedAccepted && !isNationalised) {
    return {
      status: 'FAIL',
      reason_code: 'NON_NATIONALISED_BANK_NOT_ACCEPTED',
      detail: `Non-nationalised/Co-operative bank '${classifiedBank.name}' not accepted by this lender`,
      bank_name: classifiedBank.name,
      bank_category: classifiedBank.category
    };
  }

  return {
    status: 'PASS',
    matched: `Bank '${classifiedBank.name}' (${classifiedBank.category}) accepted by lender policy`,
    bank_name: classifiedBank.name,
    bank_category: classifiedBank.category
  };
}

module.exports = {
  evaluateBank
};
