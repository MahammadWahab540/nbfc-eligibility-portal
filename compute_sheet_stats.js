const data = require('./last_5_days_emi_leads_complete.json');

const stats = {
  total: data.length,
  kycStatus: {},
  nbfcInApp: {},
  disbursedNbfc: {},
  empType: {},
  algoVerdicts: {
    ELIGIBLE: 0,
    CONDITIONAL: 0,
    INELIGIBLE: 0
  },
  topLenders: {}
};

for (const d of data) {
  const a = d.academy;
  const co = d.coApp || {};
  const res = d.res;

  const kyc = a.KYC_Submission_Status_PRE__c || co.KYC_SUBMISSION_STATUS_PRE__c || 'NOT_SUBMITTED';
  stats.kycStatus[kyc] = (stats.kycStatus[kyc] || 0) + 1;

  const appNbfc = a.Choose_NBFC_PRE__c || 'NOT_CHOSEN';
  stats.nbfcInApp[appNbfc] = (stats.nbfcInApp[appNbfc] || 0) + 1;

  const disbNbfc = a.Disbursed_NBFC_Name__c || 'Not Disbursed';
  stats.disbursedNbfc[disbNbfc] = (stats.disbursedNbfc[disbNbfc] || 0) + 1;

  const emp = d.empType || 'Unspecified';
  stats.empType[emp] = (stats.empType[emp] || 0) + 1;

  stats.algoVerdicts[d.verdict] = (stats.algoVerdicts[d.verdict] || 0) + 1;

  if (res.eligible_nbfcs.length > 0) {
    const top = res.eligible_nbfcs[0].partner_name;
    stats.topLenders[top] = (stats.topLenders[top] || 0) + 1;
  }
}

console.log(JSON.stringify(stats, null, 2));
