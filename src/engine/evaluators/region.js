/**
 * 3-Valued Regional and State Policy Evaluator
 * Supports city-level exceptions and safe multi-tier address fallback.
 */

function normalizeLocationString(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function evaluateRegion(locationObj, lenderCriteria) {
  const rejectedRegions = lenderCriteria.rejected_regions || [];

  // If lender has no regional restrictions, it PASSES regardless of state
  if (rejectedRegions.length === 0) {
    return {
      status: 'PASS',
      matched: 'No regional restrictions for this lender'
    };
  }

  // If lender has restrictions, but state is missing
  if (!locationObj || !locationObj.state) {
    return {
      status: 'UNKNOWN',
      reason_code: 'APPLICANT_STATE_MISSING',
      detail: 'State and residential geography are not specified on application.',
      missing_requirement: 'Verified residential state and pin code'
    };
  }

  const stateNorm = normalizeLocationString(locationObj.state);
  const cityNorm = normalizeLocationString(locationObj.city);

  for (const rule of rejectedRegions) {
    const ruleStateNorm = normalizeLocationString(rule.state);

    if (ruleStateNorm && stateNorm.includes(ruleStateNorm)) {
      // Check city exceptions (e.g., Guwahati in Assam, Bhilai in Chhattisgarh)
      if (rule.exceptions && Array.isArray(rule.exceptions) && rule.exceptions.length > 0) {
        if (!cityNorm) {
          // In a restricted state with city exceptions, but city is blank!
          return {
            status: 'UNKNOWN',
            reason_code: 'CITY_VERIFICATION_REQUIRED',
            detail: `State '${rule.state}' is restricted except for approved cities [${rule.exceptions.join(', ')}]. Residential city is required.`,
            missing_requirement: `Residential city confirmation for ${rule.state}`
          };
        }

        const isExcepted = rule.exceptions.some(exc => {
          const excNorm = normalizeLocationString(exc);
          return cityNorm.includes(excNorm);
        });

        if (isExcepted) {
          return {
            status: 'PASS',
            matched: `Location in '${locationObj.state}' accepted under city exception '${locationObj.city}'`,
            exception_applied: true
          };
        }
      }

      // Hard restriction without exception match
      return {
        status: 'FAIL',
        reason_code: 'REGION_RESTRICTED',
        detail: `State '${rule.state}' is on lender's restricted regions list${rule.exceptions ? ` (except ${rule.exceptions.join(', ')})` : ''}.`,
        restricted_state: rule.state,
        applicant_state: locationObj.state,
        applicant_city: locationObj.city || null
      };
    }
  }

  return {
    status: 'PASS',
    matched: `Location '${locationObj.state}' is permissible`,
    state: locationObj.state,
    city: locationObj.city || null
  };
}

module.exports = {
  evaluateRegion
};
