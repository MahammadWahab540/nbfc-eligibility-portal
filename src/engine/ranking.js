/**
 * Recommendation Ranking Module
 * Decouples ranking from evaluation.
 * Strictly ranks verified-eligible lenders by configured business priority (1 = highest priority).
 * Completely eliminates arbitrary hardcoded match scores (e.g. Fibe 95).
 */

function rankEligibleLenders(eligibleList = []) {
  // Sort ascending by priority: priority 1 comes first, priority 2 second, etc.
  const sorted = [...eligibleList].sort((a, b) => {
    const prioA = typeof a.priority === 'number' ? a.priority : 99;
    const prioB = typeof b.priority === 'number' ? b.priority : 99;
    return prioA - prioB;
  });

  // Assign 1-based sequential rank based on priority order
  return sorted.map((lender, idx) => ({
    ...lender,
    rank: idx + 1,
    selection_priority: lender.priority
  }));
}

module.exports = {
  rankEligibleLenders
};
