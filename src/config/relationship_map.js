/**
 * Canonical Relationship Normalizer & Hierarchy Mapper
 * Resolves picklist values (e.g., Salesforce "Brother (Employed)") into canonical representations
 * and allowed category families without naive substring matching.
 */

const CANONICAL_RELATIONSHIPS = {
  'mother': {
    canonical: 'Mother',
    families: ['Mother', 'Parent', 'Blood relation', 'Any relative']
  },
  'father': {
    canonical: 'Father',
    families: ['Father', 'Parent', 'Blood relation', 'Any relative']
  },
  'brother (employed)': {
    canonical: 'Brother',
    is_employed: true,
    families: ['Brother', 'Sibling', 'Siblings', 'Blood relation', 'Any relative']
  },
  'sister (employed)': {
    canonical: 'Sister',
    is_employed: true,
    families: ['Sister', 'Sibling', 'Siblings', 'Blood relation', 'Any relative']
  },
  'brother': {
    canonical: 'Brother',
    families: ['Brother', 'Sibling', 'Siblings', 'Blood relation', 'Any relative']
  },
  'sister': {
    canonical: 'Sister',
    families: ['Sister', 'Sibling', 'Siblings', 'Blood relation', 'Any relative']
  },
  'sibling': {
    canonical: 'Sibling',
    families: ['Sibling', 'Siblings', 'Blood relation', 'Any relative']
  },
  'siblings': {
    canonical: 'Sibling',
    families: ['Sibling', 'Siblings', 'Blood relation', 'Any relative']
  },
  'spouse': {
    canonical: 'Spouse',
    families: ['Spouse', 'Any relative']
  },
  'husband': {
    canonical: 'Spouse',
    families: ['Spouse', 'Any relative']
  },
  'wife': {
    canonical: 'Spouse',
    families: ['Spouse', 'Any relative']
  },
  'grandfather': {
    canonical: 'Grandfather',
    families: ['Grandfather', 'Grandparent', 'Any relative']
  },
  'grandmother': {
    canonical: 'Grandmother',
    families: ['Grandmother', 'Grandparent', 'Any relative']
  },
  'legal guardian': {
    canonical: 'Legal Guardian',
    families: ['Legal Guardian', 'Guardian']
  },
  'guardian': {
    canonical: 'Legal Guardian',
    families: ['Legal Guardian', 'Guardian']
  },
  'other': {
    canonical: 'Other',
    // 'Other' does NOT qualify as Blood relation or Sibling! Only matches if lender explicitly allows 'Other' or 'Any relative'.
    families: ['Other', 'Any relative']
  }
};

/**
 * Normalizes input relationship string.
 * Returns { raw, canonical, families, is_known }
 */
function normalizeRelationship(rawRelation) {
  if (!rawRelation || typeof rawRelation !== 'string' || !rawRelation.trim()) {
    return {
      raw: rawRelation || null,
      canonical: null,
      families: [],
      is_known: false
    };
  }

  const clean = rawRelation.trim().toLowerCase();
  const entry = CANONICAL_RELATIONSHIPS[clean];

  if (entry) {
    return {
      raw: rawRelation.trim(),
      canonical: entry.canonical,
      families: entry.families,
      is_known: true
    };
  }

  // Handle generic sibling / relative match
  if (clean.includes('brother')) {
    return {
      raw: rawRelation.trim(),
      canonical: 'Brother',
      families: ['Brother', 'Sibling', 'Siblings', 'Blood relation', 'Any relative'],
      is_known: true
    };
  }
  if (clean.includes('sister')) {
    return {
      raw: rawRelation.trim(),
      canonical: 'Sister',
      families: ['Sister', 'Sibling', 'Siblings', 'Blood relation', 'Any relative'],
      is_known: true
    };
  }

  return {
    raw: rawRelation.trim(),
    canonical: rawRelation.trim(),
    families: [rawRelation.trim(), 'Any relative'],
    is_known: true
  };
}

/**
 * Tests whether a normalized applicant relationship satisfies lender's allowed relations list.
 * Evaluates exact match against canonical name or any membership in relation's families.
 */
function isRelationshipPermitted(normalizedRel, allowedRelations = []) {
  if (!normalizedRel.is_known || !normalizedRel.canonical) {
    return { permitted: false, reason: 'Relationship is unspecified or invalid' };
  }

  const allowedLower = allowedRelations.map(r => r.trim().toLowerCase());

  // Check if any family matches the allowed relations
  const match = normalizedRel.families.find(fam => allowedLower.includes(fam.toLowerCase()));

  if (match) {
    return { permitted: true, matched_as: match };
  }

  return {
    permitted: false,
    reason: `Relationship '${normalizedRel.canonical}' does not belong to any permitted relationship: [${allowedRelations.join(', ')}]`
  };
}

module.exports = {
  CANONICAL_RELATIONSHIPS,
  normalizeRelationship,
  isRelationshipPermitted
};
