/**
 * 3-Valued Relationship Evaluator
 * Evaluates canonical relationship against lender's approved relation whitelist.
 * Distinguishes unmapped / 'Other' relationships as UNKNOWN requiring clarification
 * from confirmed prohibited relationships.
 */

const { isRelationshipPermitted } = require('../../config/relationship_map');

function evaluateRelationship(normalizedRelation, lenderCriteria) {
  const allowed = lenderCriteria.allowed_relations || [];

  if (!normalizedRelation || !normalizedRelation.is_known) {
    return {
      status: 'UNKNOWN',
      reason_code: 'RELATIONSHIP_UNSPECIFIED',
      detail: 'Relationship with co-applicant is missing or not provided.',
      missing_requirement: `Co-applicant relationship specification (permitted: [${allowed.join(', ')}])`
    };
  }

  const check = isRelationshipPermitted(normalizedRelation, allowed);

  if (check.permitted) {
    return {
      status: 'PASS',
      matched: `Relationship '${normalizedRelation.canonical}' matched approved relation '${check.matched_as}'`,
      canonical: normalizedRelation.canonical,
      original: normalizedRelation.raw
    };
  }

  // If relationship is 'Other', it is an unclarified co-applicant rather than a confirmed disallowed party.
  // Mark as UNKNOWN so applicant is CONDITIONAL pending relationship document verification.
  if (normalizedRelation.canonical === 'Other') {
    return {
      status: 'UNKNOWN',
      reason_code: 'RELATIONSHIP_CLARIFICATION_REQUIRED',
      detail: `Co-applicant relationship '${normalizedRelation.raw || 'Other'}' requires document verification to establish approved family connection [${allowed.join(', ')}].`,
      missing_requirement: `Relationship verification proof for co-applicant ('Other')`,
      canonical: normalizedRelation.canonical,
      original: normalizedRelation.raw,
      allowed_relations: allowed
    };
  }

  return {
    status: 'FAIL',
    reason_code: 'RELATIONSHIP_NOT_PERMITTED',
    detail: check.reason,
    canonical: normalizedRelation.canonical,
    original: normalizedRelation.raw,
    allowed_relations: allowed
  };
}

module.exports = {
  evaluateRelationship
};
