/**
 * Centralised NBFC Eligibility & Recommendation Engine
 * Production-Hardened Core Architecture v2.3.0
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { normalizeApplicant } = require('./normalizer');
const { evaluateLender } = require('./evaluators/lender');
const { rankEligibleLenders, rankConditionalLenders } = require('./ranking');
const { getDatabaseRepository } = require('../db/database');

class NBFCEligibilityEngine {
  constructor(options = {}) {
    this.dataPath = options.dataPath || path.join(__dirname, '..', '..', 'data');
    this.rulesPath = path.join(this.dataPath, 'rules.json');
    this.settingsPath = path.join(this.dataPath, 'settings.json');
    this.db = options.db || getDatabaseRepository();
    this.loadData();
  }

  loadData() {
    try {
      const rawRules = fs.readFileSync(this.rulesPath, 'utf8');
      this.ruleSet = JSON.parse(rawRules);
    } catch (e) {
      this.ruleSet = { version: '2.3.0', effective_date: '2026-11-02', partners: [] };
    }

    try {
      const rawSettings = fs.readFileSync(this.settingsPath, 'utf8');
      this.settings = JSON.parse(rawSettings);
    } catch (e) {
      this.settings = { cibil_bracket_policy: 'CONSERVATIVE' };
    }
  }

  saveRules(newRuleSet, actor = 'Operations User', actionDetails = 'Updated NBFC criteria') {
    this.ruleSet = newRuleSet;
    this.ruleSet.last_updated = new Date().toISOString();
    fs.writeFileSync(this.rulesPath, JSON.stringify(this.ruleSet, null, 2), 'utf8');
    this.db.recordAudit(actor, 'UPDATE_RULES', 'NBFC_RULES', actionDetails, this.ruleSet.version);
  }

  recordAudit(user, action, entity, details) {
    return this.db.recordAudit(user, action, entity, details, this.ruleSet.version || '2.3.0');
  }

  /**
   * Main Eligibility Evaluation Pipeline
   */
  evaluate(payload = {}, parameterQuestions = null, options = {}) {
    this.loadData();

    // Check idempotency if key provided
    const idempotencyKey = options.idempotencyKey || payload.idempotency_key || null;
    if (idempotencyKey) {
      const cached = this.db.getEvaluationByIdempotency(idempotencyKey);
      if (cached) {
        return {
          ...cached.results,
          is_cached_idempotent_response: true
        };
      }
    }

    const evaluationId = `eval_${crypto.randomUUID().slice(0, 12)}`;
    const applicant = normalizeApplicant(payload, parameterQuestions);

    const eligibleRaw = [];
    const conditionalRaw = [];
    const ineligibleRaw = [];
    const unknownRaw = [];
    const allMissingInformation = new Set();

    const activePartners = (this.ruleSet.partners || []).filter(p => p.is_active !== false);

    for (const partner of activePartners) {
      const result = evaluateLender(applicant, partner, {
        policy_version: this.ruleSet.version || '2.3.0',
        effective_date: this.ruleSet.effective_date || '2026-11-02'
      });

      result.missing_requirements.forEach(req => allMissingInformation.add(req));

      const lenderDecisionPayload = {
        // Section 5 Canonical Format
        nbfc: result.partner_name,
        decision: result.classification,
        reason_codes: result.reason_codes,
        hard_blockers: result.hard_blockers,
        missing_requirements: result.missing_requirements,
        verified_inputs: result.verified_inputs,
        policy_version: result.policy_version,
        algorithm_version: result.algorithm_version,
        recommended_next_action: result.recommended_next_action,

        // Backwards compatibility fields
        nbfc_code: result.nbfc_code,
        partner_id: result.partner_id,
        partner_name: result.partner_name,
        priority: result.priority,
        classification: result.classification,
        decision_status: result.decision_status,
        eligibility_status: result.decision_status,
        reason_code: result.reason_code,
        reason_detail: result.reason_detail,
        explanation: result.explanation,
        rules_evaluated: result.rules_evaluated,
        input_values: result.input_values,
        pending_verifications: result.pending_verifications,
        matched_criteria: result.matched_criteria,
        failures: result.failures.map(f => f.detail || f.reason_code),
        all_failures: result.failures,
        effective_date: result.effective_date,
        discrepancies: result.discrepancies
      };

      if (result.classification === 'ELIGIBLE') {
        eligibleRaw.push(lenderDecisionPayload);
      } else if (result.classification === 'CONDITIONAL') {
        conditionalRaw.push(lenderDecisionPayload);
      } else if (result.classification === 'UNKNOWN') {
        unknownRaw.push(lenderDecisionPayload);
      } else {
        ineligibleRaw.push(lenderDecisionPayload);
      }
    }

    // Rank eligible lenders purely by configured business priority
    const eligibleNbfcs = rankEligibleLenders(eligibleRaw);

    // Rank conditional lenders by priority with actionable next steps
    const conditionalNbfcs = rankConditionalLenders(conditionalRaw);

    // Determine high-level decision
    let overallDecision = 'NONE_ELIGIBLE';
    if (eligibleNbfcs.length > 0) {
      overallDecision = 'APPROVED';
    } else if (conditionalNbfcs.length > 0) {
      overallDecision = 'CONDITIONAL_APPROVAL';
    } else if (unknownRaw.length > 0) {
      overallDecision = 'PENDING_POLICY_CLARIFICATION';
    }

    // Construct recommendation object
    let recommendation = null;
    if (eligibleNbfcs.length > 0) {
      recommendation = {
        recommended_nbfc: eligibleNbfcs[0].partner_name,
        partner_id: eligibleNbfcs[0].partner_id,
        priority: eligibleNbfcs[0].priority,
        rank: 1,
        reason: `Highest priority approved partner (#${eligibleNbfcs[0].priority}) matching all underwriting criteria.`
      };
    } else if (conditionalNbfcs.length > 0) {
      recommendation = {
        recommended_nbfc: conditionalNbfcs[0].partner_name,
        partner_id: conditionalNbfcs[0].partner_id,
        priority: conditionalNbfcs[0].priority,
        rank: null,
        reason: `Conditional suggestion pending verification: ${conditionalNbfcs[0].reason_detail}`,
        recommended_next_action: conditionalNbfcs[0].recommended_next_action
      };
    }

    const responsePayload = {
      success: true,
      evaluation_id: evaluationId,
      rules_version: this.ruleSet.version || '2.3.0',
      effective_date: this.ruleSet.effective_date || '2026-11-02',
      algorithm_version: '2.3.0',
      timestamp: new Date().toISOString(),
      user_applicant_id: applicant.userApplicantId,
      salesforce_id: applicant.salesforceId,
      application_id: applicant.applicationId,
      attempt_id: applicant.attemptId,
      evaluation_status: 'COMPLETED',
      decision_type: overallDecision,
      final_approval: eligibleNbfcs.length > 0,
      applicant_summary: {
        name: applicant.name,
        cibil: applicant.cibil,
        monthly_income: applicant.monthlyIncome,
        is_unusually_high_income: applicant.isUnusuallyHighIncome || false,
        age: applicant.age,
        is_minor: applicant.isMinor || false,
        is_senior: applicant.isSenior || false,
        relation: applicant.relation ? applicant.relation.canonical : null,
        bank: applicant.bank ? applicant.bank.name : null,
        bank_category: applicant.bank ? applicant.bank.category : null,
        location: applicant.location
      },
      recommendation: recommendation,
      eligible_nbfcs: eligibleNbfcs,
      conditional_nbfcs: conditionalNbfcs,
      ineligible_nbfcs: ineligibleRaw,
      unknown_nbfcs: unknownRaw,
      missing_information: Array.from(allMissingInformation),
      overall_summary: {
        total_lenders_evaluated: activePartners.length,
        eligible_count: eligibleNbfcs.length,
        conditional_count: conditionalNbfcs.length,
        ineligible_count: ineligibleRaw.length,
        unknown_count: unknownRaw.length
      },
      summary: {
        total_lenders_evaluated: activePartners.length,
        eligible_count: eligibleNbfcs.length,
        conditional_count: conditionalNbfcs.length,
        ineligible_count: ineligibleRaw.length,
        unknown_count: unknownRaw.length
      }
    };

    // Persist evaluation in SQLite database (anonymizing sensitive identifiers)
    try {
      this.db.saveEvaluation({
        id: evaluationId,
        created_at: responsePayload.timestamp,
        rules_version: responsePayload.rules_version,
        salesforce_id: applicant.salesforceId,
        user_applicant_id: applicant.userApplicantId ? `${applicant.userApplicantId.slice(0, 8)}***` : null,
        evaluation_status: 'COMPLETED',
        decision_type: overallDecision,
        inputs: {
          monthly_income: applicant.monthlyIncome,
          age: applicant.age,
          relation: applicant.relation ? applicant.relation.canonical : null,
          cibil: applicant.cibil,
          bank: applicant.bank ? applicant.bank.name : null,
          state: applicant.location ? applicant.location.state : null
        },
        eligible_count: eligibleNbfcs.length,
        conditional_count: conditionalNbfcs.length,
        ineligible_count: ineligibleRaw.length,
        results: responsePayload,
        idempotency_key: idempotencyKey
      });
    } catch (err) {
      console.error('[DATABASE] Failed to persist evaluation:', err.message);
    }

    return responsePayload;
  }
}

module.exports = NBFCEligibilityEngine;
