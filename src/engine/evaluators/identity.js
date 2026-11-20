/**
 * 3-Valued Identity and Parameter Questions Evaluator
 * Evaluates the 4 Salesforce No-Cost EMI task questions + Door Number requirement.
 * When parameter questions are skipped/omitted at preliminary stage, avoids blocking lenders.
 */

function evaluateIdentity(questions = {}, lenderCriteria, options = {}) {
  const failures = [];
  const unknownRequirements = [];
  const matched = [];

  const isSkipped = questions.is_skipped === true || options.skipParameterQuestions === true;

  // 1. PAN-Aadhaar Linkage
  if (lenderCriteria.pan_aadhaar_linked_mandatory) {
    if (questions.is_pan_aadhaar_linked === false) {
      failures.push({
        reason_code: 'PAN_AADHAAR_NOT_LINKED',
        detail: 'Mandatory PAN and Aadhaar linking is missing.'
      });
    } else if (questions.is_pan_aadhaar_linked === true) {
      matched.push('PAN-Aadhaar linked');
    } else if (!isSkipped) {
      unknownRequirements.push({
        reason_code: 'PAN_AADHAAR_STATUS_UNVERIFIED',
        detail: 'PAN-Aadhaar linkage verification status is missing.',
        missing_requirement: 'Confirmation that co-applicant PAN and Aadhaar are linked'
      });
    }
  }

  // 2. Physical or E-PAN Availability
  if (lenderCriteria.physical_pan_mandatory) {
    if (questions.has_physical_pan === false || questions.has_e_pan_or_physical_pan === false) {
      failures.push({
        reason_code: 'PHYSICAL_PAN_MANDATORY',
        detail: 'Physical PAN card is mandatory for this lender.'
      });
    } else if (questions.has_physical_pan === true || questions.has_e_pan_or_physical_pan === true) {
      matched.push('Physical PAN card verified');
    } else if (!isSkipped) {
      unknownRequirements.push({
        reason_code: 'PHYSICAL_PAN_UNVERIFIED',
        detail: 'Physical PAN card availability is unverified.',
        missing_requirement: 'Physical PAN card document'
      });
    }
  } else if (lenderCriteria.pan_card_mandatory) {
    if (questions.has_e_pan_or_physical_pan === false) {
      failures.push({
        reason_code: 'PAN_CARD_NOT_AVAILABLE',
        detail: 'Physical or E-PAN card is mandatory for this lender.'
      });
    } else if (questions.has_e_pan_or_physical_pan === true) {
      matched.push('PAN card verified');
    } else if (!isSkipped) {
      unknownRequirements.push({
        reason_code: 'PAN_AVAILABILITY_UNVERIFIED',
        detail: 'PAN card physical/electronic availability status is missing.',
        missing_requirement: 'Physical PAN or E-PAN card document'
      });
    }
  }

  // 3. Date of Birth Mismatch
  if (lenderCriteria.dob_mismatch_allowed === false) {
    if (questions.has_dob_mismatch === true) {
      failures.push({
        reason_code: 'DOB_MISMATCH_DISALLOWED',
        detail: 'DOB mismatch between Aadhaar and PAN is not allowed by this lender.'
      });
    } else if (questions.has_dob_mismatch === false) {
      matched.push('DOB verified (no mismatch)');
    } else if (!isSkipped) {
      unknownRequirements.push({
        reason_code: 'DOB_MISMATCH_UNVERIFIED',
        detail: 'Aadhaar-to-PAN date of birth consistency is unverified.',
        missing_requirement: 'Confirmation of consistent Date of Birth between Aadhaar and PAN'
      });
    }
  }

  // 4. Name Mismatch
  if (lenderCriteria.name_mismatch_allowed === false) {
    if (questions.has_name_mismatch === true) {
      failures.push({
        reason_code: 'NAME_MISMATCH_DISALLOWED',
        detail: 'Name mismatch between Aadhaar and PAN is not allowed by this lender.'
      });
    } else if (questions.has_name_mismatch === false) {
      matched.push('Name verified (no mismatch)');
    } else if (!isSkipped) {
      unknownRequirements.push({
        reason_code: 'NAME_MISMATCH_UNVERIFIED',
        detail: 'Aadhaar-to-PAN name consistency is unverified.',
        missing_requirement: 'Confirmation of consistent Name between Aadhaar and PAN'
      });
    }
  }

  // 5. Door / House Number
  if (lenderCriteria.door_number_mandatory === true) {
    if (questions.has_door_number === false) {
      failures.push({
        reason_code: 'DOOR_NUMBER_MISSING',
        detail: 'Address door/house number is mandatory for this lender.'
      });
    } else if (questions.has_door_number === true) {
      matched.push('Door number verified');
    } else if (!isSkipped) {
      unknownRequirements.push({
        reason_code: 'DOOR_NUMBER_UNVERIFIED',
        detail: 'Presence of physical door/house number is unverified.',
        missing_requirement: 'Residential door/house number verification'
      });
    }
  }

  return {
    failures,
    unknownRequirements,
    matched
  };
}

module.exports = {
  evaluateIdentity
};
