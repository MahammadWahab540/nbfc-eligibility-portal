/**
 * Recommendation Ranking Module
 * Engine v2.3.0
 * 
 * Ranks qualifying lenders based on:
 * 1. Verified eligibility (Strict filter: Only ELIGIBLE lenders in prime recommendations)
 * 2. Business priority, applicant fit, and processing turnaround
 * 3. Conditional lenders ranked separately with actionable next steps
 * 
 * Invariant: Never allows historical conversion to override hard eligibility rules.
 */

function rankEligibleLenders(eligibleList = []) {
  // Filter strictly for ELIGIBLE lenders
  const validEligible = eligibleList.filter(l => (l.decision || l.decision_status) === 'ELIGIBLE');

  // Sort ascending by priority: priority 1 comes first, priority 2 second, etc.
  const sorted = [...validEligible].sort((a, b) => {
    const prioA = typeof a.priority === 'number' ? a.priority : 99;
    const prioB = typeof b.priority === 'number' ? b.priority : 99;
    return prioA - prioB;
  });

  return sorted.map((lender, idx) => ({
    ...lender,
    rank: idx + 1,
    selection_priority: lender.priority
  }));
}

function rankConditionalLenders(conditionalList = []) {
  const validConditional = conditionalList.filter(l => (l.decision || l.decision_status) === 'CONDITIONAL');

  const sorted = [...validConditional].sort((a, b) => {
    const prioA = typeof a.priority === 'number' ? a.priority : 99;
    const prioB = typeof b.priority === 'number' ? b.priority : 99;
    return prioA - prioB;
  });

  return sorted.map((lender, idx) => ({
    ...lender,
    conditional_rank: idx + 1,
    selection_priority: lender.priority,
    action_required: lender.recommended_next_action || 'Complete pending verification'
  }));
}

module.exports = {
  rankEligibleLenders,
  rankConditionalLenders
};
