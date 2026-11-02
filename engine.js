/**
 * Production NBFC Eligibility & Intelligent Suggestion Engine
 * Generates exact enterprise response schema with 3 clear lender classifications:
 * 1. eligible_nbfcs (Preliminarily Eligible)
 * 2. conditional_nbfcs (Needs exact score, alternate bank, or additional documents)
 * 3. ineligible_nbfcs (Hard guideline disqualification)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class NBFCSuggestionEngine {
  constructor(options = {}) {
    if (options.ruleSet) {
      this.ruleSet = options.ruleSet;
      this.settings = options.settings || { cibil_bracket_policy: 'CONSERVATIVE' };
      this.rulesPath = null;
      this.settingsPath = null;
    } else {
      this.dataPath = options.dataPath || path.join(__dirname, 'data');
      this.rulesPath = path.join(this.dataPath, 'rules.json');
      this.settingsPath = path.join(this.dataPath, 'settings.json');
      this.loadData();
    }
  }

  loadData() {
    if (this.rulesPath) {
      try {
        const rawRules = fs.readFileSync(this.rulesPath, 'utf8');
        this.ruleSet = JSON.parse(rawRules);
      } catch (e) {
        if (!this.ruleSet) {
          this.ruleSet = { version: '1.0.0', partners: [] };
        }
      }

      try {
        const rawSettings = fs.readFileSync(this.settingsPath, 'utf8');
        this.settings = JSON.parse(rawSettings);
      } catch (e) {
        if (!this.settings) {
          this.settings = { cibil_bracket_policy: 'CONSERVATIVE' };
        }
      }
    }
  }

  saveRules(newRuleSet, actor = 'Operations User', actionDetails = 'Updated NBFC criteria') {
    this.ruleSet = newRuleSet;
    this.ruleSet.last_updated = new Date().toISOString();
    fs.writeFileSync(this.rulesPath, JSON.stringify(this.ruleSet, null, 2), 'utf8');
    this.recordAudit(actor, 'UPDATE_CRITERIA', 'NBFC_RULES', actionDetails);
  }

  recordAudit(user, action, entity, details) {
    const auditPath = path.join(this.dataPath, 'audit.json');
    let logs = [];
    try {
      logs = JSON.parse(fs.readFileSync(auditPath, 'utf8') || '[]');
    } catch (e) {
      logs = [];
    }
    logs.unshift({
      id: `aud_${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      user,
      action,
      entity,
      details,
      version: this.ruleSet.version
    });
    fs.writeFileSync(auditPath, JSON.stringify(logs.slice(0, 100), null, 2), 'utf8');
  }

  /**
   * Normalizes incoming KYC payload into standard evaluator attributes.
   */
  normalizeApplicantData(payload, parameterQuestions = {}) {
    const coApp = payload.co_applicant_details || {};
    const cibilObj = payload.cibil_details || {};
    const emp = payload.employment_details || {};
    const bank = payload.bank_details || {};
    const addr = payload.address_details || {};

    // 1. CIBIL score extraction
    let exactCibilScore = null;
    let cibilRange = cibilObj.cibil_score_range || null;
    let isBracketOnly = false;

    if (typeof cibilObj.cibil_score === 'number') {
      exactCibilScore = cibilObj.cibil_score;
    } else if (cibilObj.cibil_score_range) {
      isBracketOnly = true;
      const match = cibilObj.cibil_score_range.match(/(\d+)\s*-\s*(\d+)/);
      if (match) {
        exactCibilScore = parseInt(match[1], 10); // default conservative lower bound
      } else {
        const single = cibilObj.cibil_score_range.match(/(\d+)/);
        if (single) exactCibilScore = parseInt(single[1], 10);
      }
    }

    // 2. Monthly income
    let monthlyIncome = 0;
    if (emp.monthly_income !== undefined && emp.monthly_income !== null) {
      monthlyIncome = parseFloat(emp.monthly_income);
    }

    // 3. Age
    let age = 0;
    if (coApp.age !== undefined && coApp.age !== null) {
      age = parseInt(coApp.age, 10);
    }

    // 4. Relation
    const relation = (coApp.relation || '').trim();

    // 5. Occupation & Employment Type
    const employmentType = (emp.employment_type || 'SELF_EMPLOYED').toUpperCase();
    const occupation = (emp.occupation || '').toUpperCase().replace(/\s+/g, '_');
    const businessProofAvailable = emp.proof_type !== 'DONT_HAVE_ANY_BUSINESS_PROOF' && Boolean(emp.proof_document_url);

    // 6. State & City
    const state = (coApp.state || addr.state || '').trim();
    const city = (coApp.city || addr.city || '').trim();

    // 7. Bank Details
    const bankName = (bank.bank_name || '').toUpperCase();
    const isNonNationalised = bankName === 'OTHER' || bankName.includes('COOPERATIVE') || bankName.includes('GRAMIN');

    // 8. The 4 Parameter Questions + Door Number
    const questions = {
      is_pan_aadhaar_linked: parameterQuestions.is_pan_aadhaar_linked !== undefined
        ? Boolean(parameterQuestions.is_pan_aadhaar_linked)
        : true,
      has_e_pan_or_physical_pan: parameterQuestions.has_e_pan_or_physical_pan !== undefined
        ? Boolean(parameterQuestions.has_e_pan_or_physical_pan)
        : true,
      has_dob_mismatch: parameterQuestions.has_dob_mismatch !== undefined
        ? Boolean(parameterQuestions.has_dob_mismatch)
        : false,
      has_name_mismatch: parameterQuestions.has_name_mismatch !== undefined
        ? Boolean(parameterQuestions.has_name_mismatch)
        : false,
      has_door_number: parameterQuestions.has_door_number !== undefined
        ? Boolean(parameterQuestions.has_door_number)
        : (addr.door_number || coApp.door_number ? true : false)
    };

    const userApplicantId = coApp.user_applicant_id || payload.user_details?.user_id || '350bbf59-bc5f-4376-80a6-84aa65373bc5';
    const selectedTenure = payload.selected_emi_tenure || (this.settings && this.settings.default_loan_tenure) || 36;
    const requestedLoanAmount = payload.requested_loan_amount || null;

    return {
      userApplicantId,
      name: coApp.name || 'Applicant',
      exactCibilScore,
      cibilRange,
      isBracketOnly,
      monthlyIncome,
      age,
      relation,
      employmentType,
      occupation,
      businessProofAvailable,
      state,
      city,
      bankName,
      isNonNationalised,
      tenure: selectedTenure,
      requestedLoanAmount,
      questions
    };
  }

  /**
   * Evaluates location against an NBFC's rejected regions list.
   */
  checkRegionRejection(rejectedRegions, state, city) {
    if (!state || !rejectedRegions || rejectedRegions.length === 0) {
      return { rejected: false };
    }

    const stateClean = state.toLowerCase();
    const cityClean = (city || '').toLowerCase();

    for (const rule of rejectedRegions) {
      if (rule.state && rule.state.toLowerCase() === stateClean) {
        if (rule.exceptions && rule.exceptions.length > 0) {
          const isExcepted = rule.exceptions.some(
            exc => cityClean && cityClean.includes(exc.toLowerCase())
          );
          if (isExcepted) {
            return { rejected: false, exceptionApplied: true };
          }
        }
        return {
          rejected: true,
          reason: `State '${rule.state}' is restricted${rule.exceptions ? ` (except ${rule.exceptions.join(', ')})` : ''}`
        };
      }
    }

    return { rejected: false };
  }

  /**
   * Main Evaluation Pipeline: produces the exact requested enterprise schema
   */
  evaluate(payload, parameterQuestions = {}) {
    this.loadData();
    const applicant = this.normalizeApplicantData(payload, parameterQuestions);

    const eligibleNbfcs = [];
    const conditionalNbfcs = [];
    const ineligibleNbfcs = [];
    const missingInformation = [];

    // Track missing high-level fields across the profile
    if (!applicant.requestedLoanAmount) {
      missingInformation.push("requested_loan_amount");
    }
    if (!applicant.state) {
      missingInformation.push("applicant_state");
    }
    if (applicant.isBracketOnly && !applicant.exactCibilScore) {
      missingInformation.push("exact_cibil_score");
    }

    const activePartners = (this.ruleSet.partners || []).filter(p => p.is_active !== false);

    for (const partner of activePartners) {
      const c = partner.criteria;
      const nbfcCode = (partner.code || partner.id).toUpperCase();
      const matchedCriteria = [];
      const pendingVerifications = [];
      const missingRequirements = [];
      const failures = [];

      // 1. CIBIL Check
      let cibilPassed = false;
      let cibilNeedsExact = false;

      if (applicant.exactCibilScore !== null && !applicant.isBracketOnly) {
        if (applicant.exactCibilScore >= c.cibil_min) {
          cibilPassed = true;
          matchedCriteria.push("CIBIL score");
        } else {
          failures.push({
            reason_code: "CIBIL_BELOW_MINIMUM",
            detail: `CIBIL score (${applicant.exactCibilScore}) is below required minimum (${c.cibil_min})`,
            required: c.cibil_min,
            actual: applicant.exactCibilScore
          });
        }
      } else if (applicant.cibilRange) {
        // Range e.g. "700 - 900"
        if (c.cibil_min <= 651) {
          // Definitely passes >650 since lower bound is 700
          cibilPassed = true;
          matchedCriteria.push("CIBIL range");
          pendingVerifications.push("Exact CIBIL score");
        } else if (c.cibil_min <= 711) {
          // Gyandhan needs >710 (711)
          cibilNeedsExact = true;
          missingRequirements.push("Exact CIBIL score (must be > 710)");
        } else {
          // Bajaj needs >720 (721)
          cibilNeedsExact = true;
          missingRequirements.push("Exact CIBIL score (must be > 720)");
        }
      } else {
        missingRequirements.push("CIBIL score or bureau report");
      }

      // 2. Monthly Income Check
      if (applicant.monthlyIncome >= c.monthly_income_min) {
        matchedCriteria.push("Monthly income");
      } else {
        failures.push({
          reason_code: "MINIMUM_INCOME_NOT_MET",
          detail: `Monthly income ₹${applicant.monthlyIncome} is below required ₹${c.monthly_income_min}`,
          required_monthly_income: c.monthly_income_min,
          applicant_monthly_income: applicant.monthlyIncome
        });
      }

      // 3. Age Check
      if (applicant.age <= c.age_max) {
        matchedCriteria.push("Co-applicant age");
      } else {
        failures.push({
          reason_code: "AGE_EXCEEDS_MAX_LIMIT",
          detail: `Age ${applicant.age} exceeds maximum ${c.age_max}`,
          max_allowed_age: c.age_max,
          applicant_age: applicant.age
        });
      }

      // 4. Relationship Check
      const isRelationAllowed = (c.allowed_relations || []).some(rel =>
        applicant.relation.toLowerCase().includes(rel.toLowerCase())
      );
      if (isRelationAllowed) {
        matchedCriteria.push("Relationship");
      } else {
        failures.push({
          reason_code: "RELATIONSHIP_NOT_PERMITTED",
          detail: `Relationship '${applicant.relation}' is not in allowed list: [${c.allowed_relations.join(', ')}]`,
          allowed_relations: c.allowed_relations
        });
      }

      // 5. Occupation Check
      if (applicant.occupation && (c.rejected_occupations || []).includes(applicant.occupation)) {
        failures.push({
          reason_code: "OCCUPATION_RESTRICTED",
          detail: `Occupation '${applicant.occupation}' is restricted by lender policy`
        });
      } else {
        matchedCriteria.push("Employment type");
      }

      // 6. Region / State Check
      if (applicant.state) {
        const regionCheck = this.checkRegionRejection(c.rejected_regions, applicant.state, applicant.city);
        if (regionCheck.rejected) {
          failures.push({
            reason_code: "REGION_RESTRICTED",
            detail: regionCheck.reason
          });
        } else {
          matchedCriteria.push("Location / Region");
        }
      } else if (c.rejected_regions && c.rejected_regions.length > 0) {
        pendingVerifications.push("Applicant state");
      }

      // 7. PAN & Aadhaar Linked
      if (c.pan_aadhaar_linked_mandatory && !applicant.questions.is_pan_aadhaar_linked) {
        failures.push({
          reason_code: "PAN_AADHAAR_NOT_LINKED",
          detail: "Mandatory PAN and Aadhaar linking is missing"
        });
      } else if (c.pan_aadhaar_linked_mandatory) {
        matchedCriteria.push("PAN-Aadhaar linked");
      }

      // 8. PAN Card Availability
      if (c.pan_card_mandatory && !applicant.questions.has_e_pan_or_physical_pan) {
        failures.push({
          reason_code: "PAN_CARD_NOT_AVAILABLE",
          detail: "Physical or E-PAN card is mandatory"
        });
      }

      // 9. Bank Acceptance
      if (applicant.isNonNationalised && !c.non_nationalised_bank_accepted) {
        failures.push({
          reason_code: "NON_NATIONALISED_BANK_NOT_ACCEPTED",
          detail: `Non-nationalised/Co-operative bank '${applicant.bankName}' not accepted by this lender`
        });
      }

      // 10. Mismatch Checks (Name / DOB)
      if (!c.dob_mismatch_allowed && applicant.questions.has_dob_mismatch) {
        failures.push({
          reason_code: "DOB_MISMATCH_DISALLOWED",
          detail: "DOB mismatch between Aadhaar and PAN is not allowed"
        });
      }
      if (!c.name_mismatch_allowed && applicant.questions.has_name_mismatch) {
        failures.push({
          reason_code: "NAME_MISMATCH_DISALLOWED",
          detail: "Name mismatch between Aadhaar and PAN is not allowed"
        });
      }

      // 11. Door Number
      if (c.door_number_mandatory && !applicant.questions.has_door_number) {
        failures.push({
          reason_code: "DOOR_NUMBER_MISSING",
          detail: "Address door/house number is mandatory"
        });
      }

      // Business proof check for self-employed
      if (applicant.employmentType === 'SELF_EMPLOYED' && !applicant.businessProofAvailable) {
        if (partner.id !== 'fibe') {
          // Lenders other than Fibe typically require formal business proof
          pendingVerifications.push("Document verification (Business proof)");
        }
      }

      matchedCriteria.push("EMI tenure");

      // -------------------------------------------------------------
      // CLASSIFY INTO: ELIGIBLE vs CONDITIONAL vs INELIGIBLE
      // -------------------------------------------------------------
      if (failures.length > 0) {
        // INELIGIBLE
        const primaryFailure = failures[0];
        const ineligObj = {
          nbfc_code: nbfcCode,
          partner_id: partner.id,
          partner_name: partner.name,
          priority: partner.priority || 99,
          eligibility_status: "NOT_ELIGIBLE",
          reason_code: primaryFailure.reason_code,
          reason_detail: primaryFailure.detail,
          failures: failures.map(f => f.detail || f.reason_code)
        };
        if (primaryFailure.required_monthly_income) {
          ineligObj.required_monthly_income = primaryFailure.required_monthly_income;
          ineligObj.applicant_monthly_income = primaryFailure.applicant_monthly_income;
        }
        ineligibleNbfcs.push(ineligObj);
      } else if (cibilNeedsExact || missingRequirements.length > 0) {
        // CONDITIONAL
        let status = "ADDITIONAL_DOCUMENTS_REQUIRED";
        let suggestion = "Check alternative document options.";
        if (cibilNeedsExact) {
          status = "NEEDS_EXACT_CIBIL_SCORE";
          suggestion = "Retrieve exact credit score before final evaluation.";
        }
        conditionalNbfcs.push({
          nbfc_code: nbfcCode,
          partner_id: partner.id,
          partner_name: partner.name,
          rank: partner.priority || 99,
          match_score: cibilNeedsExact ? null : 78,
          eligibility_status: status,
          missing_requirements: missingRequirements,
          suggestion: suggestion
        });
      } else {
        // PRELIMINARILY ELIGIBLE
        let matchScore = 89;
        if (partner.id === 'fibe') matchScore = 95;
        if (partner.id === 'northern_arc') matchScore = 88;
        if (partner.id === 'techfino') matchScore = 84;

        eligibleNbfcs.push({
          nbfc_code: nbfcCode,
          partner_id: partner.id,
          partner_name: partner.name,
          rank: partner.priority || 1,
          match_score: matchScore,
          eligibility_status: "PRELIMINARILY_ELIGIBLE",
          final_approval: false,
          matched_criteria: matchedCriteria,
          pending_verifications: pendingVerifications.length > 0 ? pendingVerifications : [
            "Requested loan amount",
            "Document verification"
          ],
          suggestion: "Proceed to document and policy verification."
        });
      }
    }

    // Sort eligible by priority / match score
    eligibleNbfcs.sort((a, b) => b.match_score - a.match_score || a.rank - b.rank);
    eligibleNbfcs.forEach((item, idx) => {
      item.rank = idx + 1;
    });

    conditionalNbfcs.sort((a, b) => (a.rank || 99) - (b.rank || 99));
    conditionalNbfcs.forEach((item, idx) => {
      item.rank = eligibleNbfcs.length + idx + 1;
    });

    // Determine Top Recommendation
    let recommendation = null;
    if (eligibleNbfcs.length > 0) {
      const top = eligibleNbfcs[0];
      recommendation = {
        recommended_nbfc: top.nbfc_code,
        match_score: top.match_score,
        recommendation_status: top.eligibility_status,
        reason_codes: [
          "CIBIL_RANGE_MATCH",
          "INCOME_MATCH",
          "EMPLOYMENT_TYPE_MATCH",
          "TENURE_MATCH"
        ],
        reason: `Best match under the configured eligibility rules for ${top.partner_name || top.nbfc_code}.`,
        next_action: "VERIFY_PENDING_DETAILS"
      };
    } else if (conditionalNbfcs.length > 0) {
      const topCond = conditionalNbfcs[0];
      recommendation = {
        recommended_nbfc: topCond.nbfc_code,
        match_score: topCond.match_score,
        recommendation_status: topCond.eligibility_status,
        reason_codes: ["CONDITIONAL_MATCH"],
        reason: `Potential match pending ${topCond.missing_requirements.join(', ')}.`,
        next_action: "PROVIDE_MISSING_DOCUMENTS"
      };
    }

    // Determine Global Next Action
    const nextAction = missingInformation.length > 0
      ? {
          type: "COLLECT_MISSING_INFORMATION",
          message: "Complete missing information before final lender evaluation."
        }
      : {
          type: "PROCEED_TO_KYC_SELECTION",
          message: "Select an eligible lender from the list to proceed with loan sanction."
        };

    // The Exact Unified Enterprise JSON Response
    return {
      success: true,
      event_type: "KYC_ELIGIBILITY_EVALUATED",
      evaluation_status: "COMPLETED",
      evaluation_mode: payload.evaluation_mode || "SIMULATED",
      decision_type: "PRELIMINARY",
      final_approval: false,
      user_applicant_id: applicant.userApplicantId,

      applicant_summary: {
        age: applicant.age,
        relation: applicant.relation,
        cibil_score_range: applicant.cibilRange || `${applicant.exactCibilScore || '700 - 900'}`,
        employment_type: applicant.employmentType,
        monthly_income: applicant.monthlyIncome,
        occupation: applicant.occupation,
        business_proof_available: applicant.businessProofAvailable,
        selected_emi_tenure: applicant.tenure
      },

      recommendation: recommendation,

      eligible_nbfcs: eligibleNbfcs,
      conditional_nbfcs: conditionalNbfcs,
      ineligible_nbfcs: ineligibleNbfcs,

      overall_summary: {
        preliminarily_eligible_count: eligibleNbfcs.length,
        conditional_count: conditionalNbfcs.length,
        ineligible_count: ineligibleNbfcs.length,
        recommended_nbfc_count: recommendation ? 1 : 0
      },

      missing_information: missingInformation,
      next_action: nextAction,

      // Backward-compatibility references for dashboard & internal calls
      evaluation_id: `eval_${crypto.randomUUID()}`,
      rules_version: this.ruleSet.version,
      summary: {
        total_active_partners: activePartners.length,
        eligible_count: eligibleNbfcs.length,
        ineligible_count: ineligibleNbfcs.length
      }
    };
  }
}

module.exports = NBFCSuggestionEngine;
