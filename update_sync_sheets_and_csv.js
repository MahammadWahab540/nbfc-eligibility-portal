const fs = require('fs');
const { execSync } = require('child_process');
const NBFCEligibilityEngine = require('./src/engine/index');

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const str = String(val).replace(/₹/g, 'INR ');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

const engine = new NBFCEligibilityEngine();
const sfData = require('./fresh_150_sf_data.json');
const existing150 = require('./last_5_days_emi_leads_complete.json');

const academyMap = new Map();
sfData.academyRecords.forEach(a => academyMap.set(a.Id, a));

const coAppMap = new Map();
sfData.coAppRecords.forEach(c => coAppMap.set(c.Id, c));

const headers = [
  'User_ID',
  'SF_Academy_ID',
  'SF_Co_Applicant_ID',
  'EMI_Setup_Date_Time',
  'Current_KYC_Status',
  'KYC_Submission_Date',
  'NBFC_In_Application',
  'Disbursed_NBFC',
  'Co_Applicant_Employment_Type',
  'Co_Applicant_Occupation',
  'Co_Applicant_Relationship',
  'Co_Applicant_Monthly_Income_INR',
  'CIBIL_Score_Range',
  'Bank_Code',
  'State',
  'Current_SF_Eligible_NBFCs',
  'Local_Algo_Verdict',
  'Local_Algo_Eligible_NBFCs',
  'Local_Algo_Conditional_NBFCs',
  'Local_Algo_Ineligible_NBFCs',
  'Top_Suggested_NBFC',
  'Local_Algo_Recommendation_Reason'
];

const rows = [headers.map(escapeCSV).join(',')];
const newCompleteData = [];

for (let i = 0; i < existing150.length; i++) {
  const item = existing150[i];
  const a = academyMap.get(item.academy.Id) || item.academy;
  const co = coAppMap.get(item.coApp.Id) || item.coApp;

  const resolvedState = a.State__c || co.Co_Applicant_state_pre__c || a.Co_Applicant_State_PRE__c || null;
  const empType = co.Co_Applicant_Employment_Type_PRE__c || a.Co_Applicant_Employment_Type_PRE__c || item.empType || 'Unspecified';
  const cibil = co.CIBIL_SCORE_RANGE_PRE__c || 'UNSPECIFIED';
  const income = co.COAPPLICANT_MONTHLY_INCOME_PRE__c || 0;

  const payload = {
    Id: co.Id,
    salesforce_id: co.Id,
    userId: a.userId__c || null,
    Name: a.Name,
    CIBIL_SCORE_RANGE_PRE__c: cibil,
    COAPPLICANT_MONTHLY_INCOME_PRE__c: income,
    Co_Applicant_s_Bank_Name_PRE__c: co.Co_Applicant_s_Bank_Name_PRE__c,
    RELATION_WITH_THE_COAPPLICANT_PRE__c: co.RELATION_WITH_THE_COAPPLICANT_PRE__c,
    Co_Applicant_Occupation_PRE__c: co.Co_Applicant_Occupation_PRE__c,
    Co_Applicant_Employment_Type_PRE__c: empType,
    Co_Applicant_age_pre__c: co.Co_Applicant_age_pre__c,
    State: resolvedState,
    Co_Applicant_state_pre__c: resolvedState,
    parameter_questions: {
      has_name_mismatch: co.NAME_mismatch_in_Adhaar_and_PAN__c === 'Yes',
      has_dob_mismatch: co.DOB_mismatch_in_Adhaar_and_PAN__c === 'Yes',
      is_pan_aadhaar_linked: co.PAN_and_Adhaar_is_to_be_linked__c !== 'No',
      has_e_pan_or_physical_pan: co.E_Pan_Physical_PAN_Availability__c !== 'No',
      has_door_number: true
    }
  };

  const res = engine.evaluate(payload);

  const eligibleStr = res.eligible_nbfcs.map(e => e.partner_name).join(', ') || 'None';

  const conditionalStr = res.conditional_nbfcs.map(c => {
    const req = (c.missing_requirements || []).join('; ');
    return c.partner_name + (req ? ' (' + req + ')' : '');
  }).join(' | ') || 'None';

  const ineligibleStr = res.ineligible_nbfcs.map(inelig => {
    const reas = (inelig.failures || []).map(f => f.detail || f.reason_code).join('; ');
    return inelig.partner_name + (reas ? ' [' + reas + ']' : '');
  }).join(' | ') || 'None';

  let verdict = 'INELIGIBLE';
  if (res.eligible_nbfcs.length > 0) verdict = 'ELIGIBLE';
  else if (res.conditional_nbfcs.length > 0) verdict = 'CONDITIONAL';

  let topRec = 'None';
  let reason = '';

  if (res.eligible_nbfcs.length > 0) {
    topRec = res.eligible_nbfcs[0].partner_name;
    reason = `Approved for ${res.eligible_nbfcs.map(e => e.partner_name).join(', ')} on CIBIL ${cibil}, income INR ${income} (${empType}).`;
  } else if (res.conditional_nbfcs.length > 0) {
    topRec = 'Pending Verification';
    const topReqs = res.conditional_nbfcs.slice(0, 2).map(c => `${c.partner_name}: ${c.missing_requirements?.[0] || 'Verification pending'}`).join('; ');
    reason = `Conditional approval subject to: ${topReqs}`;
  } else {
    topRec = 'No Lender Match';
    reason = `Disqualified across lenders: ${res.ineligible_nbfcs[0]?.failures?.[0]?.detail || 'Criteria not met'}`;
  }

  const kycStatus = a.KYC_Submission_Status_PRE__c || co.KYC_SUBMISSION_STATUS_PRE__c || 'NOT_SUBMITTED';
  const kycDate = a.KYC_Submission_Date_and_Time_PRE__c || co.KYC_SUBMISSION_DATE_AND_TIME_PRE__c || '';
  const nbfcInApp = a.Choose_NBFC_PRE__c || 'NOT_CHOSEN';
  const disbNbfc = a.Disbursed_NBFC_Name__c || 'Not Disbursed';

  const row = [
    a.userId__c || '',
    a.Id || '',
    co.Id || '',
    a.Emi_Setup_Date_Time__c || '',
    kycStatus,
    kycDate,
    nbfcInApp,
    disbNbfc,
    empType,
    co.Co_Applicant_Occupation_PRE__c || '',
    co.RELATION_WITH_THE_COAPPLICANT_PRE__c || '',
    co.COAPPLICANT_MONTHLY_INCOME_PRE__c !== undefined && co.COAPPLICANT_MONTHLY_INCOME_PRE__c !== null ? co.COAPPLICANT_MONTHLY_INCOME_PRE__c : '',
    cibil,
    co.Co_Applicant_s_Bank_Name_PRE__c || 'None',
    resolvedState || 'Unspecified',
    reason, // Currently updated SF field
    verdict,
    eligibleStr,
    conditionalStr,
    ineligibleStr,
    topRec,
    reason
  ];

  rows.push(row.map(escapeCSV).join(','));

  newCompleteData.push({
    academy: a,
    coApp: co,
    empType,
    res,
    verdict
  });
}

fs.writeFileSync('last_5_days_emi_setup_evaluated_no_pii.csv', rows.join('\n'), 'utf8');
fs.writeFileSync('last_5_days_emi_leads_complete.json', JSON.stringify(newCompleteData, null, 2), 'utf8');
console.log('Saved last_5_days_emi_setup_evaluated_no_pii.csv and last_5_days_emi_leads_complete.json successfully.');

// Now push updated CSV to Google Sheet
try {
  console.log('Uploading updated CSV to Google Sheet 1_bMX1Xz7UFZZiNd7anc0fhT0GvqdrtCZSzCEcWtSlwc...');
  execSync('gsheets write --sheet-id 1_bMX1Xz7UFZZiNd7anc0fhT0GvqdrtCZSzCEcWtSlwc --from-csv last_5_days_emi_setup_evaluated_no_pii.csv', { stdio: 'inherit' });
  console.log('Google Sheet updated successfully!');
} catch (e) {
  console.error('Note: gsheets write finished with:', e.message);
}
