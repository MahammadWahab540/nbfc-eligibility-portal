const fs = require('fs');

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const str = String(val).replace(/₹/g, 'INR ');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

const data = require('./last_2_days_emi_leads.json');

const headers = [
  'User_ID',
  'SF_Academy_Onboarding_ID',
  'SF_Co_Applicant_ID',
  'Onboarding_Status',
  'EMI_Setup_Date_Time',
  'Chosen_NBFC',
  'Disbursed_NBFC',
  'CIBIL_Score_Range',
  'Co_Applicant_Monthly_Income_INR',
  'Co_Applicant_Relationship',
  'Co_Applicant_Occupation',
  'Co_Applicant_Age',
  'Bank_Identifier',
  'State',
  'Current_SF_Eligible_NBFCs',
  'Algorithm_Verdict',
  'Algorithm_Eligible_NBFCs',
  'Algorithm_Conditional_NBFCs',
  'Algorithm_Ineligible_NBFCs',
  'Top_Recommended_NBFC',
  'Algorithm_Decision_Reason'
];

const rows = [headers.map(escapeCSV).join(',')];

for (const item of data) {
  const a = item.academy;
  const co = item.coApp || {};
  const res = item.res;

  const eligibleStr = res.eligible_nbfcs.map(e => e.partner_name).join(', ') || 'None';

  const conditionalStr = res.conditional_nbfcs.map(c => {
    const req = (c.missing_requirements || []).join('; ');
    return c.partner_name + (req ? ' (' + req + ')' : '');
  }).join(' | ') || 'None';

  const ineligibleStr = res.ineligible_nbfcs.map(i => {
    const reas = (i.rejection_reasons || []).join('; ');
    return i.partner_name + (reas ? ' [' + reas + ']' : '');
  }).join(' | ') || 'None';

  let verdict = 'INELIGIBLE';
  if (res.eligible_nbfcs.length > 0) verdict = 'ELIGIBLE';
  else if (res.conditional_nbfcs.length > 0) verdict = 'CONDITIONAL';

  let topRec = 'None';
  let reason = '';
  if (res.eligible_nbfcs.length > 0) {
    topRec = res.eligible_nbfcs[0].partner_name;
    reason = 'Approved for ' + res.eligible_nbfcs.map(e => e.partner_name).join(', ') + ' on CIBIL ' + (co.CIBIL_SCORE_RANGE_PRE__c || 'N/A') + ' and income INR ' + (co.COAPPLICANT_MONTHLY_INCOME_PRE__c || 0) + '.';
  } else if (res.conditional_nbfcs.length > 0) {
    topRec = 'Pending Verification';
    const topReqs = res.conditional_nbfcs.slice(0, 2).map(c => c.partner_name + ': ' + (c.missing_requirements?.[0] || 'Verification pending')).join('; ');
    reason = 'Conditional approval subject to: ' + topReqs;
  } else {
    topRec = 'No Lender Match';
    reason = 'Disqualified across lenders: ' + (res.ineligible_nbfcs[0]?.rejection_reasons?.[0] || 'Criteria not met');
  }

  const row = [
    a.userId__c || '',
    a.Id || '',
    co.Id || '',
    a.Onboarding_Status__c || '',
    a.Emi_Setup_Date_Time__c || '',
    a.Choose_NBFC_PRE__c || 'NOT_CHOSEN',
    a.Disbursed_NBFC_Name__c || 'Not Disbursed',
    co.CIBIL_SCORE_RANGE_PRE__c || 'UNSPECIFIED',
    co.COAPPLICANT_MONTHLY_INCOME_PRE__c !== undefined && co.COAPPLICANT_MONTHLY_INCOME_PRE__c !== null ? co.COAPPLICANT_MONTHLY_INCOME_PRE__c : '',
    co.RELATION_WITH_THE_COAPPLICANT_PRE__c || '',
    co.Co_Applicant_Occupation_PRE__c || '',
    co.Co_Applicant_age_pre__c !== undefined && co.Co_Applicant_age_pre__c !== null ? co.Co_Applicant_age_pre__c : '',
    co.Co_Applicant_s_Bank_Name_PRE__c || 'None',
    co.Co_Applicant_state_pre__c || a.Co_Applicant_State_PRE__c || 'Unspecified',
    a.Eligible_NBFCs_PRE__c || co.Eligible_NBFCs_PRE__c || 'None',
    verdict,
    eligibleStr,
    conditionalStr,
    ineligibleStr,
    topRec,
    reason
  ];

  rows.push(row.map(escapeCSV).join(','));
}

const csvContent = rows.join('\r\n');
fs.writeFileSync('emi_setup_leads_nbfc_evaluation_no_pii.csv', csvContent, 'utf8');
console.log('Saved emi_setup_leads_nbfc_evaluation_no_pii.csv with ' + (rows.length - 1) + ' records.');
