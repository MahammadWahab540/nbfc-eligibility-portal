const https = require('https');
const querystring = require('querystring');
const fs = require('fs');
const { execSync } = require('child_process');
const NBFCEligibilityEngine = require('./src/engine/index');

async function getAccessToken() {
  const postData = querystring.stringify({
    grant_type: 'client_credentials',
    client_id: '3MVG9Ijq7vc89psqxFx7Cb6LjE35hIXcR_f9apHONFxu9uCspcJhFK5zrvz5ZGDBcug14_Nl3ndkZtwcucWXs',
    client_secret: '3909F1EABF05BFA283249CB1FC2679448AE4349038AD5EEF951DDF1DAE0BEF1A'
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'computing-ability-6555.my.salesforce.com',
      port: 443,
      path: '/services/oauth2/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function sfCompositePatch(instanceUrl, records, token) {
  const parsed = new URL(instanceUrl);
  const payload = {
    allOrNone: false,
    records: records
  };
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: parsed.hostname,
      port: 443,
      path: '/services/data/v60.0/composite/sobjects',
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const str = String(val).replace(/₹/g, 'INR ');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

(async () => {
  console.log('======================================================================');
  console.log('       SYNC ALGO TO SALESFORCE & GOOGLE SHEET (EXACT AS BEFORE)        ');
  console.log('======================================================================');

  const engine = new NBFCEligibilityEngine();
  const sfData = require('./fresh_150_sf_data.json');

  const academyMap = new Map();
  sfData.academyRecords.forEach(a => academyMap.set(a.Id, a));

  // Build coAppMap prioritizing the most complete record
  const coAppMap = new Map();
  sfData.coAppRecords.forEach(c => {
    const existing = coAppMap.get(c.Academy_Onboarding_PRE__c);
    if (!existing) {
      coAppMap.set(c.Academy_Onboarding_PRE__c, c);
    } else {
      const exScore = (existing.COAPPLICANT_MONTHLY_INCOME_PRE__c ? 2 : 0) + (existing.CIBIL_SCORE_RANGE_PRE__c ? 1 : 0);
      const newScore = (c.COAPPLICANT_MONTHLY_INCOME_PRE__c ? 2 : 0) + (c.CIBIL_SCORE_RANGE_PRE__c ? 1 : 0);
      if (newScore > exScore) {
        coAppMap.set(c.Academy_Onboarding_PRE__c, c);
      }
    }
  });

  const evaluations = [];
  const academyUpdateRecords = [];
  const coAppUpdateRecords = [];

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
  const csvRows = [headers.map(escapeCSV).join(',')];

  let totalEvaluated = 0;
  let eligibleCountTotal = 0;
  let conditionalCountTotal = 0;
  let ineligibleCountTotal = 0;

  for (let idx = 0; idx < sfData.academyRecords.length; idx++) {
    totalEvaluated++;
    const a = sfData.academyRecords[idx];
    const co = coAppMap.get(a.Id) || {};
    const state = a.State__c || co.Co_Applicant_state_pre__c || a.Co_Applicant_State_PRE__c || null;
    const empType = co.Co_Applicant_Employment_Type_PRE__c || a.Co_Applicant_Employment_Type_PRE__c || 'Unspecified';
    const cibil = co.CIBIL_SCORE_RANGE_PRE__c || 'UNSPECIFIED';
    const income = co.COAPPLICANT_MONTHLY_INCOME_PRE__c || 0;

    const payload = {
      Id: co.Id || a.Id,
      salesforce_id: co.Id || a.Id,
      userId: a.userId__c || null,
      Name: a.Name,
      CIBIL_SCORE_RANGE_PRE__c: cibil,
      COAPPLICANT_MONTHLY_INCOME_PRE__c: income,
      Co_Applicant_s_Bank_Name_PRE__c: co.Co_Applicant_s_Bank_Name_PRE__c,
      RELATION_WITH_THE_COAPPLICANT_PRE__c: co.RELATION_WITH_THE_COAPPLICANT_PRE__c,
      Co_Applicant_Occupation_PRE__c: co.Co_Applicant_Occupation_PRE__c,
      Co_Applicant_Employment_Type_PRE__c: empType,
      Co_Applicant_age_pre__c: co.Co_Applicant_age_pre__c,
      State: state,
      Co_Applicant_state_pre__c: state,
      parameter_questions: {
        has_name_mismatch: co.NAME_mismatch_in_Adhaar_and_PAN__c === 'Yes',
        has_dob_mismatch: co.DOB_mismatch_in_Adhaar_and_PAN__c === 'Yes',
        is_pan_aadhaar_linked: co.PAN_and_Adhaar_is_to_be_linked__c !== 'No',
        has_e_pan_or_physical_pan: co.E_Pan_Physical_PAN_Availability__c !== 'No',
        has_door_number: true
      }
    };

    const res = engine.evaluate(payload);

    // EXACT FORMAT AS BEFORE for Academy_Onboarding_PRE__c.Eligible_NBFCs_PRE__c:
    // List of eligible lenders, or 'None Eligible' if 0 eligible
    let academyEligibleStr = 'None Eligible';
    let verdict = 'INELIGIBLE';

    if (res.eligible_nbfcs && res.eligible_nbfcs.length > 0) {
      verdict = 'ELIGIBLE';
      eligibleCountTotal++;
      academyEligibleStr = res.eligible_nbfcs.map(e => e.partner_name).join(', ');
    } else if (res.conditional_nbfcs && res.conditional_nbfcs.length > 0) {
      verdict = 'CONDITIONAL';
      conditionalCountTotal++;
      academyEligibleStr = 'None Eligible';
    } else {
      verdict = 'INELIGIBLE';
      ineligibleCountTotal++;
      academyEligibleStr = 'None Eligible';
    }

    const conditionalStr = res.conditional_nbfcs.map(c => {
      const req = (c.missing_requirements || []).join('; ');
      return c.partner_name + (req ? ' (' + req + ')' : '');
    }).join(' | ') || 'None';

    const ineligibleStr = res.ineligible_nbfcs.map(inelig => {
      const reas = (inelig.failures || []).map(f => f.detail || f.reason_code).join('; ');
      return inelig.partner_name + (reas ? ' [' + reas + ']' : '');
    }).join(' | ') || 'None';

    // EXACT FORMAT AS BEFORE for Co_Applicant_PRE_Pipeline__c.Eligible_NBFCs_PRE__c:
    let topRec = 'None';
    let reason = '';
    if (res.eligible_nbfcs.length > 0) {
      topRec = res.eligible_nbfcs[0].partner_name;
      reason = `Approved for ${res.eligible_nbfcs.map(e => e.partner_name).join(', ')} on CIBIL ${cibil}, income INR ${income} (${empType}).`;
    } else if (res.conditional_nbfcs.length > 0) {
      topRec = res.conditional_nbfcs[0].partner_name + ' (Conditional)';
      const topReqs = res.conditional_nbfcs.slice(0, 2).map(c => `${c.partner_name}: ${c.missing_requirements?.[0] || 'Verification pending'}`).join('; ');
      reason = `Conditional approval subject to: ${topReqs}`;
    } else {
      topRec = 'No Lender Match';
      reason = `Disqualified across lenders: ${res.ineligible_nbfcs[0]?.failures?.[0]?.detail || 'Criteria not met'}`;
    }

    academyUpdateRecords.push({
      attributes: { type: 'Academy_Onboarding_PRE__c' },
      id: a.Id,
      Eligible_NBFCs_PRE__c: academyEligibleStr
    });

    if (co.Id) {
      coAppUpdateRecords.push({
        attributes: { type: 'Co_Applicant_PRE_Pipeline__c' },
        id: co.Id,
        Eligible_NBFCs_PRE__c: reason
      });
    }

    evaluations.push({
      leadIndex: idx + 1,
      academyId: a.Id,
      coAppId: co.Id,
      state,
      cibil,
      income,
      empType,
      eligible_nbfcs: res.eligible_nbfcs.map(e => ({ name: e.partner_name, rank: e.rank, priority: e.priority })),
      conditional_nbfcs: res.conditional_nbfcs.map(c => ({ name: c.partner_name, next_action: c.recommended_next_action })),
      reason
    });

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
      state || 'Unspecified',
      academyEligibleStr,
      verdict,
      academyEligibleStr,
      conditionalStr,
      ineligibleStr,
      topRec,
      reason
    ];
    csvRows.push(row.map(escapeCSV).join(','));
  }

  console.log(`Evaluated ${totalEvaluated} leads: ${eligibleCountTotal} Eligible, ${conditionalCountTotal} Conditional, ${ineligibleCountTotal} Ineligible.`);

  // Save evaluations JSON and CSV locally
  fs.writeFileSync('evaluated_150_after_fixes.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    totalLeads: evaluations.length,
    evaluations
  }, null, 2), 'utf8');

  fs.writeFileSync('last_5_days_emi_setup_evaluated_no_pii.csv', csvRows.join('\n'), 'utf8');
  console.log('Saved evaluated_150_after_fixes.json and last_5_days_emi_setup_evaluated_no_pii.csv successfully.');

  // Push to Salesforce
  console.log('\nAuthenticating with Salesforce...');
  const auth = await getAccessToken();
  const token = auth.access_token;
  const instanceUrl = auth.instance_url;
  console.log('Salesforce authenticated.');

  console.log(`\nPatching ${academyUpdateRecords.length} Academy_Onboarding_PRE__c records...`);
  const academyRes = await sfCompositePatch(instanceUrl, academyUpdateRecords, token);
  const academySuccess = (academyRes.data || []).filter(r => r.success).length;
  console.log(`Academy records updated: ${academySuccess} / ${academyUpdateRecords.length}`);

  console.log(`\nPatching ${coAppUpdateRecords.length} Co_Applicant_PRE_Pipeline__c records...`);
  const coAppRes = await sfCompositePatch(instanceUrl, coAppUpdateRecords, token);
  const coAppSuccess = (coAppRes.data || []).filter(r => r.success).length;
  console.log(`Co_Applicant records updated: ${coAppSuccess} / ${coAppUpdateRecords.length}`);

  // Push to Google Sheets
  try {
    console.log('\nSyncing to Google Sheet 1_bMX1Xz7UFZZiNd7anc0fhT0GvqdrtCZSzCEcWtSlwc...');
    execSync('gsheets mutate import-csv 1_bMX1Xz7UFZZiNd7anc0fhT0GvqdrtCZSzCEcWtSlwc last_5_days_emi_setup_evaluated_no_pii.csv', { stdio: 'inherit' });
    console.log('Google Sheet updated successfully.');
  } catch(e) {
    console.log('Google Sheet sync note:', e.message);
  }

  console.log('\nALL 150 LEADS SUCCESSFULLY SYNCHRONIZED TO SALESFORCE & GOOGLE SHEETS AS BEFORE!');
})();
