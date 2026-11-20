const data = require('./last_2_days_emi_leads.json');

const stats = {
  totalRecords: data.length,
  disbursedCount: 0,
  disbursedByNBFC: {},
  chosenByNBFC: {},
  sfEligibleBreakdown: {},
  algoVerdicts: {
    ELIGIBLE: 0,
    CONDITIONAL: 0,
    INELIGIBLE: 0
  },
  contradictions: 0 // Disbursed, but SF says "None Eligible"
};

for (const item of data) {
  const a = item.academy;
  const co = item.coApp;
  const res = item.res;

  if (a.Disbursed_NBFC_Name__c) {
    stats.disbursedCount++;
    stats.disbursedByNBFC[a.Disbursed_NBFC_Name__c] = (stats.disbursedByNBFC[a.Disbursed_NBFC_Name__c] || 0) + 1;
  }

  const chosen = a.Choose_NBFC_PRE__c || 'NOT_CHOSEN';
  stats.chosenByNBFC[chosen] = (stats.chosenByNBFC[chosen] || 0) + 1;

  const sfVal = a.Eligible_NBFCs_PRE__c || co.Eligible_NBFCs_PRE__c || 'BLANK';
  stats.sfEligibleBreakdown[sfVal] = (stats.sfEligibleBreakdown[sfVal] || 0) + 1;

  if (a.Disbursed_NBFC_Name__c && (sfVal === 'None Eligible' || sfVal.includes('Not Eligible'))) {
    stats.contradictions++;
  }

  if (res.eligible_nbfcs.length > 0) stats.algoVerdicts.ELIGIBLE++;
  else if (res.conditional_nbfcs.length > 0) stats.algoVerdicts.CONDITIONAL++;
  else stats.algoVerdicts.INELIGIBLE++;
}

console.log('EMI Setup Leads (Last 2 Days) Analytics:');
console.log(JSON.stringify(stats, null, 2));
