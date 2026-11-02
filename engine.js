/**
 * Centralised NBFC Eligibility & Suggestion Engine
 * Production Facade
 * Delegates to modular architecture in src/engine/index.js
 */

const NBFCEligibilityEngine = require('./src/engine/index');
const { normalizeApplicant } = require('./src/engine/normalizer');

class NBFCSuggestionEngine extends NBFCEligibilityEngine {
  constructor(options = {}) {
    super(options);
  }

  // Legacy helper method preservation
  normalizeApplicantData(payload, parameterQuestions = {}) {
    return normalizeApplicant(payload, parameterQuestions);
  }
}

module.exports = NBFCSuggestionEngine;
