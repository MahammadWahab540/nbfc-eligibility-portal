const fs = require('fs');

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const str = String(val).replace(/₹/g, 'INR ');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

const data = require('./last_week_leads_evaluated.json');
let sfLeadsData = null;
const academyMap = new Map();
try {
  sfLeadsData = require('./leads_kyc_last_week.json');
  ['submitted_date_filter', 'active_in_stage_filter', 'created_last_week_filter'].forEach(key => {
    (sfLeadsData[key] || []).forEach(r => {
      if (r.userId__c && r.Id) {
        academyMap.set(r.userId__c, r.Id);
      }
    });
  });
} catch (e) {}

const headers = [
  'User_ID',
  'SF_Co_Applicant_ID',
  'SF_Academy_Onboarding_ID',
  'KYC_Submission_Status',
  'KYC_Submission_Date',
  'Chosen_NBFC_In_App',
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

for (const p of data.processed) {
  const eligibleStr = p.eligiblePartners.map(e => e.name).join(', ') || 'None';

  const conditionalStr = p.conditionalPartners.map(c => {
    const req = (c.requirements || []).join('; ');
    return c.name + (req ? ' (' + req + ')' : '');
  }).join(' | ') || 'None';

  const ineligibleStr = p.ineligiblePartners.map(i => {
    const reas = (i.reasons || []).join('; ');
    return i.name + (reas ? ' [' + reas + ']' : '');
  }).join(' | ') || 'None';

  let verdict = 'INELIGIBLE';
  if (p.eligiblePartners.length > 0) verdict = 'ELIGIBLE';
  else if (p.conditionalPartners.length > 0) verdict = 'CONDITIONAL';

  let topRec = 'None';
  let reason = '';
  if (p.eligiblePartners.length > 0) {
    topRec = p.eligiblePartners[0].name;
    reason = 'Approved for ' + p.eligiblePartners.map(e => e.name).join(', ') + ' based on ' + p.cibil + ' CIBIL and monthly income INR ' + (p.income || 0) + '.';
  } else if (p.conditionalPartners.length > 0) {
    topRec = 'Pending Verification';
    const topReqs = p.conditionalPartners.slice(0, 2).map(c => c.name + ': ' + (c.requirements?.[0] || 'Verification pending')).join('; ');
    reason = 'Conditional approval subject to: ' + topReqs;
  } else {
    topRec = 'No Lender Match';
    reason = 'Disqualified across lenders: ' + (p.ineligiblePartners[0]?.reasons?.[0] || 'Criteria not met');
  }

  const academyId = p.userId ? (academyMap.get(p.userId) || '') : '';

  const row = [
    p.userId || '',
    p.id || '',
    academyId,
    p.kycStatus || '',
    p.kycDate || '',
    p.chosenNBFC || 'NOT_CHOSEN',
    p.cibil || 'UNSPECIFIED',
    p.income !== null && p.income !== undefined ? p.income : '',
    p.relation || '',
    p.occupation || '',
    p.age !== null && p.age !== undefined ? p.age : '',
    p.bank || 'None',
    p.state || 'Unspecified',
    p.currentSFValue || 'None',
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
fs.writeFileSync('kyc_leads_nbfc_evaluation_no_pii.csv', csvContent, 'utf8');
console.log('Successfully written ' + (rows.length - 1) + ' records to kyc_leads_nbfc_evaluation_no_pii.csv');
