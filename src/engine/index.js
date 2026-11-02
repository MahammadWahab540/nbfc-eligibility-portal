/**
 * Centralised NBFC Eligibility & Recommendation Engine
 * Production-Hardened Core Architecture
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { normalizeApplicant } = require('./normalizer');
const { evaluateLender } = require('./evaluators/lender');
const { rankEligibleLenders } = require('./ranking');
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
      this.ruleSet = { version: '1.2.0', partners: [] };
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
    return this.db.recordAudit(user, action, entity, details, this.ruleSet.version || '1.2.0');
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
    const allMissingInformation = new Set();

    const activePartners = (this.ruleSet.partners || []).filter(p => p.is_active !== false);

    for (const partner of activePartners) {
      const result = evaluateLender(applicant, partner);

      result.missing_requirements.forEach(req => allMissingInformation.add(req));

      if (result.classification === 'ELIGIBLE') {
        eligibleRaw.push({
          nbfc_code: result.nbfc_code,
          partner_id: result.partner_id,
          partner_name: result.partner_name,
          priority: result.priority,
          eligibility_status: 'PRELIMINARILY_ELIGIBLE',
          matched_criteria: result.matched_criteria,
          discrepancies: result.discrepancies
        });
      } else if (result.classification === 'CONDITIONAL') {
        conditionalRaw.push({
          nbfc_code: result.nbfc_code,
          partner_id: result.partner_id,
          partner_name: result.partner_name,
          priority: result.priority,
          eligibility_status: 'CONDITIONAL',
          reason_code: result.primary_reason_code,
          reason_detail: result.primary_reason_detail,
          missing_requirements: result.missing_requirements,
          pending_verifications: result.pending_verifications,
          matched_criteria: result.matched_criteria,
          discrepancies: result.discrepancies
        });
      } else {
        ineligibleRaw.push({
          nbfc_code: result.nbfc_code,
          partner_id: result.partner_id,
          partner_name: result.partner_name,
          priority: result.priority,
          eligibility_status: 'NOT_ELIGIBLE',
          reason_code: result.primary_reason_code,
          reason_detail: result.primary_reason_detail,
          failures: result.failures.map(f => f.detail || f.reason_code),
          all_failures: result.failures,
          discrepancies: result.discrepancies
        });
      }
    }

    // Rank eligible lenders purely by configured business priority
    const eligibleNbfcs = rankEligibleLenders(eligibleRaw);

    // Rank conditional lenders by priority
    const conditionalNbfcs = [...conditionalRaw].sort((a, b) => a.priority - b.priority);

    // Determine high-level decision
    let overallDecision = 'NONE_ELIGIBLE';
    if (eligibleNbfcs.length > 0) {
      overallDecision = 'APPROVED';
    } else if (conditionalNbfcs.length > 0) {
      overallDecision = 'CONDITIONAL_APPROVAL';
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
        reason: `Conditional suggestion pending verification: ${conditionalNbfcs[0].reason_detail}`
      };
    }

    const responsePayload = {
      success: true,
      evaluation_id: evaluationId,
      rules_version: this.ruleSet.version || '1.2.0',
      timestamp: new Date().toISOString(),
      user_applicant_id: applicant.userApplicantId,
      salesforce_id: applicant.salesforceId,
      evaluation_status: 'COMPLETED',
      decision_type: overallDecision,
      final_approval: eligibleNbfcs.length > 0,
      applicant_summary: {
        name: applicant.name,
        cibil: applicant.cibil,
        monthly_income: applicant.monthlyIncome,
        age: applicant.age,
        relation: applicant.relation.canonical,
        bank: applicant.bank.name,
        bank_category: applicant.bank.category,
        location: applicant.location
      },
      recommendation: recommendation,
      eligible_nbfcs: eligibleNbfcs,
      conditional_nbfcs: conditionalNbfcs,
      ineligible_nbfcs: ineligibleRaw,
      missing_information: Array.from(allMissingInformation),
      overall_summary: {
        total_lenders_evaluated: activePartners.length,
        preliminarily_eligible_count: eligibleNbfcs.length,
        conditional_count: conditionalNbfcs.length,
        ineligible_count: ineligibleRaw.length
      },
      summary: {
        total_lenders_evaluated: activePartners.length,
        eligible_count: eligibleNbfcs.length,
        conditional_count: conditionalNbfcs.length,
        ineligible_count: ineligibleRaw.length
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
          relation: applicant.relation.canonical,
          cibil: applicant.cibil,
          bank: applicant.bank.name,
          state: applicant.location.state
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
