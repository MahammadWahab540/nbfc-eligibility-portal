/**
 * 3-Valued Occupation and Employment Evaluator
 * Verifies occupation against lender blacklists/negative profile lists.
 */

function evaluateOccupation(normalizedOccupation, lenderCriteria) {
  const rejected = (lenderCriteria.rejected_occupations || []).map(o => o.toUpperCase().replace(/\s+/g, '_'));

  if (!normalizedOccupation || normalizedOccupation.is_unspecified) {
    if (rejected.length > 0) {
      return {
        status: 'UNKNOWN',
        reason_code: 'OCCUPATION_UNSPECIFIED',
        detail: 'Occupation is not specified on the application.',
        missing_requirement: 'Co-applicant occupation confirmation'
      };
    }
    return {
      status: 'PASS',
      matched: 'Employment details'
    };
  }

  const occCode = normalizedOccupation.code;

  if (rejected.includes(occCode)) {
    return {
      status: 'FAIL',
      reason_code: 'OCCUPATION_RESTRICTED',
      detail: `Occupation '${normalizedOccupation.raw}' is on lender's restricted occupations list.`,
      occupation: normalizedOccupation.raw
    };
  }

  return {
    status: 'PASS',
    matched: `Occupation '${normalizedOccupation.raw}' is permissible`,
    occupation: normalizedOccupation.raw
  };
}

module.exports = {
  evaluateOccupation
};
