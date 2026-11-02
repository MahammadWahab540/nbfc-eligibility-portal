/**
 * NBFC Policy Discrepancy Matrix & Conflict Registry
 * Tracks conflicting criteria between the BRD Master Sheet (nbfc_sheet.csv / logic doc)
 * and the active rules specification (data/rules.json).
 * Flags unresolved items with NEEDS_BUSINESS_CONFIRMATION and applies safe fallback policies.
 */

const LENDER_DISCREPANCIES = {
  northern_arc: [
    {
      field: 'criteria.monthly_income_min',
      label: 'Minimum Monthly Income',
      brd_value: 0,
      rules_value: 18000,
      status: 'NEEDS_BUSINESS_CONFIRMATION',
      impact: 'Setting to 18000 causes 284 rejections in applicants earning 15k-18k. BRD row 35 notes zero income for Northern Arc.',
      safe_policy: 'REQUIRE_ACTIVE_RULE_WITH_AUDIT',
      note: 'Until business risk team signs off on ₹0 non-earning co-applicant policy, engine uses configured rule value (18,000) and marks 15k-18k as conditional or flagged for confirmation.'
    },
    {
      field: 'criteria.cibil_min',
      label: 'Minimum CIBIL Cutoff',
      brd_value: 676, // >675
      rules_value: 651, // >650
      status: 'NEEDS_BUSINESS_CONFIRMATION',
      impact: 'If set to 675, applicants in 650-675 range are rejected. If set to 651, more applicants pass.',
      safe_policy: 'FLAGGED_CUTOFF',
      note: 'BRD specifies >675 (676 min). Rules config has 651. Applicants between 650-675 need exact score verification.'
    },
    {
      field: 'criteria.rejected_regions',
      label: 'Regional Restrictions',
      brd_value: ['Jammu & Kashmir', 'North East India', 'Odisha'],
      rules_value: [],
      status: 'NEEDS_BUSINESS_CONFIRMATION',
      impact: 'BRD explicitly blocks J&K, North East India, and Odisha for Northern Arc. Rules.json left it empty.',
      safe_policy: 'SAFE_CONSERVATIVE_CHECK',
      note: 'Regions specified in BRD must be reviewed by business ops before full loosening.'
    },
    {
      field: 'criteria.name_mismatch_allowed',
      label: 'Name Mismatch Toleration',
      brd_value: false, // "they wont accept/yes"
      rules_value: false,
      status: 'ALIGNED',
      note: 'Both BRD and active rules do not allow Name mismatch for Northern Arc.'
    },
    {
      field: 'criteria.dob_mismatch_allowed',
      label: 'DOB Mismatch Toleration',
      brd_value: false, // "they wont accept/yes"
      rules_value: true,
      status: 'NEEDS_BUSINESS_CONFIRMATION',
      impact: 'Rules config permitted DOB mismatch; BRD says they will not accept.',
      safe_policy: 'REQUIRE_ACCURATE_IDENTITY',
      note: 'Requires confirmation from Northern Arc risk team on whether minor DOB variances are tolerated.'
    }
  ]
};

function getDiscrepancies(lenderId) {
  return LENDER_DISCREPANCIES[lenderId] || [];
}

function getAllDiscrepancies() {
  return LENDER_DISCREPANCIES;
}

module.exports = {
  LENDER_DISCREPANCIES,
  getDiscrepancies,
  getAllDiscrepancies
};
