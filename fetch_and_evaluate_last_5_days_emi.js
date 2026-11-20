const https = require('https');
const http = require('http');
const querystring = require('querystring');
const fs = require('fs');
const NBFCEligibilityEngine = require('./src/engine/index');
const engine = new NBFCEligibilityEngine();

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

function sfQueryAll(instanceUrl, soql, token) {
  const parsed = new URL(instanceUrl);
  let allRecords = [];

  function fetchPage(urlPath) {
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: parsed.hostname,
        port: 443,
        path: urlPath,
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const body = JSON.parse(data);
            allRecords = allRecords.concat(body.records || []);
            if (body.nextRecordsUrl) {
              fetchPage(body.nextRecordsUrl).then(resolve).catch(reject);
            } else {
              resolve(allRecords);
            }
          } catch(e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  return fetchPage('/services/data/v60.0/query?q=' + encodeURIComponent(soql));
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
  console.log('Connecting to Salesforce...');
  const auth = await getAccessToken();
  const token = auth.access_token;
  const instanceUrl = auth.instance_url;
  console.log('Authenticated successfully.');

  // Query last 5 days EMI setup leads
  const soql = `SELECT Id, Name, userId__c, Onboarding_Status__c, Emi_Setup_Date_Time__c, EMI_Setup_Date_by_JODO__c, EMI_Setup_Done_Checkbox_PRE__c, KYC_Submission_Status_PRE__c, KYC_Submission_Date_and_Time_PRE__c, Choose_NBFC_PRE__c, Disbursed_NBFC_Name__c, Eligible_NBFCs_PRE__c, Co_Applicant_State_PRE__c, LastModifiedDate FROM Academy_Onboarding_PRE__c WHERE (Emi_Setup_Date_Time__c = LAST_N_DAYS:5 OR (Onboarding_Status__c = 'EMI Setup Done' AND LastModifiedDate = LAST_N_DAYS:5)) ORDER BY Emi_Setup_Date_Time__c DESC NULLS LAST, LastModifiedDate DESC`;

  console.log('Fetching Academy records for last 5 days...');
  const academyRecords = await sfQueryAll(instanceUrl, soql, token);
  console.log(`Fetched ${academyRecords.length} Academy records.`);

  // Fetch Co_Applicant records
  const academyIds = academyRecords.map(r => `'${r.Id}'`);
  let coAppRecords = [];
  const chunkSize = 200;
  for (let i = 0; i < academyIds.length; i += chunkSize) {
    const chunk = academyIds.slice(i, i + chunkSize);
    const coAppSoql = `SELECT Id, Name, Academy_Onboarding_PRE__c, CIBIL_SCORE_RANGE_PRE__c, COAPPLICANT_MONTHLY_INCOME_PRE__c, Co_Applicant_s_Bank_Name_PRE__c, RELATION_WITH_THE_COAPPLICANT_PRE__c, Co_Applicant_Occupation_PRE__c, Co_Applicant_age_pre__c, Co_Applicant_state_pre__c, NAME_mismatch_in_Adhaar_and_PAN__c, DOB_mismatch_in_Adhaar_and_PAN__c, PAN_and_Adhaar_is_to_be_linked__c, E_Pan_Physical_PAN_Availability__c, Eligible_NBFCs_PRE__c, KYC_SUBMISSION_STATUS_PRE__c, KYC_SUBMISSION_DATE_AND_TIME_PRE__c FROM Co_Applicant_PRE_Pipeline__c WHERE Academy_Onboarding_PRE__c IN (${chunk.join(',')})`;
    const res = await sfQueryAll(instanceUrl, coAppSoql, token);
    coAppRecords = coAppRecords.concat(res);
  }
  console.log(`Fetched ${coAppRecords.length} Co-Applicant records.`);

  const coAppMap = new Map();
  for (const c of coAppRecords) {
    if (!coAppMap.has(c.Academy_Onboarding_PRE__c)) {
      coAppMap.set(c.Academy_Onboarding_PRE__c, c);
    }
  }

  // Analytics aggregations
  const stats = {
    totalRecords: academyRecords.length,
    strictlyTimestampedEMI5Days: 0,
    kycStatusDistribution: {},
    nbfcInApplicationDistribution: {},
    disbursedNBFCDistribution: {},
    cibilDistribution: {},
    algoVerdictDistribution: {
      ELIGIBLE: 0,
      CONDITIONAL: 0,
      INELIGIBLE: 0
    },
    contradictionsCount: 0
  };

  const headers = [
    'User_ID',
    'SF_Academy_ID',
    'SF_Co_Applicant_ID',
    'Current_Stage',
    'EMI_Setup_Date_Time',
    'Current_KYC_Status',
    'KYC_Submission_Date',
    'NBFC_In_Application',
    'Disbursed_NBFC',
    'CIBIL_Score_Range',
    'Co_Applicant_Monthly_Income_INR',
    'Co_Applicant_Relationship',
    'Co_Applicant_Occupation',
    'Co_Applicant_Age',
    'Bank_Code',
    'State',
    'Current_SF_Eligible_NBFCs',
    'Local_Algo_Verdict',
    'Local_Algo_Eligible_NBFCs',
    'Local_Algo_Conditional_NBFCs',
    'Local_Algo_Ineligible_NBFCs',
    'Top_Suggested_NBFC',
    'Local_Algo_Reason'
  ];

  const csvRows = [headers.map(escapeCSV).join(',')];
  const processedData = [];

  for (const a of academyRecords) {
    const co = coAppMap.get(a.Id) || {};
    const state = co.Co_Applicant_state_pre__c || a.Co_Applicant_State_PRE__c || null;

    if (a.Emi_Setup_Date_Time__c) {
      stats.strictlyTimestampedEMI5Days++;
    }

    const kycStatus = a.KYC_Submission_Status_PRE__c || co.KYC_SUBMISSION_STATUS_PRE__c || 'NOT_SUBMITTED';
    stats.kycStatusDistribution[kycStatus] = (stats.kycStatusDistribution[kycStatus] || 0) + 1;

    const nbfcInApp = a.Choose_NBFC_PRE__c || 'NOT_CHOSEN';
    stats.nbfcInApplicationDistribution[nbfcInApp] = (stats.nbfcInApplicationDistribution[nbfcInApp] || 0) + 1;

    if (a.Disbursed_NBFC_Name__c) {
      stats.disbursedNBFCDistribution[a.Disbursed_NBFC_Name__c] = (stats.disbursedNBFCDistribution[a.Disbursed_NBFC_Name__c] || 0) + 1;
    }

    const cibil = co.CIBIL_SCORE_RANGE_PRE__c || 'UNSPECIFIED';
    stats.cibilDistribution[cibil] = (stats.cibilDistribution[cibil] || 0) + 1;

    // Run local algo
    const payload = {
      CIBIL_SCORE_RANGE_PRE__c: co.CIBIL_SCORE_RANGE_PRE__c,
      COAPPLICANT_MONTHLY_INCOME_PRE__c: co.COAPPLICANT_MONTHLY_INCOME_PRE__c,
      Co_Applicant_s_Bank_Name_PRE__c: co.Co_Applicant_s_Bank_Name_PRE__c,
      RELATION_WITH_THE_COAPPLICANT_PRE__c: co.RELATION_WITH_THE_COAPPLICANT_PRE__c,
      Co_Applicant_Occupation_PRE__c: co.Co_Applicant_Occupation_PRE__c,
      Co_Applicant_age_pre__c: co.Co_Applicant_age_pre__c,
      State: state,
      Co_Applicant_state_pre__c: state,
      parameter_questions: {
        has_name_mismatch: co.NAME_mismatch_in_Adhaar_and_PAN__c === 'Yes',
        has_dob_mismatch: co.DOB_mismatch_in_Adhaar_and_PAN__c === 'Yes',
        is_pan_aadhaar_linked: co.PAN_and_Adhaar_is_to_be_linked__c !== 'No',
        has_e_pan_or_physical_pan: co.E_Pan_Physical_PAN_Availability__c !== 'No'
      }
    };

    const res = engine.evaluate(payload);

    let verdict = 'INELIGIBLE';
    if (res.eligible_nbfcs.length > 0) {
      verdict = 'ELIGIBLE';
      stats.algoVerdictDistribution.ELIGIBLE++;
    } else if (res.conditional_nbfcs.length > 0) {
      verdict = 'CONDITIONAL';
      stats.algoVerdictDistribution.CONDITIONAL++;
    } else {
      stats.algoVerdictDistribution.INELIGIBLE++;
    }

    const sfVal = a.Eligible_NBFCs_PRE__c || co.Eligible_NBFCs_PRE__c || 'BLANK';
    if (a.Disbursed_NBFC_Name__c && (sfVal === 'None Eligible' || sfVal.includes('Not Eligible'))) {
      stats.contradictionsCount++;
    }

    const eligibleStr = res.eligible_nbfcs.map(e => e.partner_name).join(', ') || 'None';
    const conditionalStr = res.conditional_nbfcs.map(c => {
      const req = (c.missing_requirements || []).join('; ');
      return c.partner_name + (req ? ' (' + req + ')' : '');
    }).join(' | ') || 'None';
    const ineligibleStr = res.ineligible_nbfcs.map(i => {
      const reas = (i.rejection_reasons || []).join('; ');
      return i.partner_name + (reas ? ' [' + reas + ']' : '');
    }).join(' | ') || 'None';

    let topRec = 'None';
    let reason = '';
    if (res.eligible_nbfcs.length > 0) {
      topRec = res.eligible_nbfcs[0].partner_name;
      reason = 'Eligible for ' + res.eligible_nbfcs.map(e => e.partner_name).join(', ') + ' with CIBIL ' + cibil + ' & income INR ' + (co.COAPPLICANT_MONTHLY_INCOME_PRE__c || 0) + '.';
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
      kycStatus,
      a.KYC_Submission_Date_and_Time_PRE__c || co.KYC_SUBMISSION_DATE_AND_TIME_PRE__c || '',
      nbfcInApp,
      a.Disbursed_NBFC_Name__c || 'Not Disbursed',
      cibil,
      co.COAPPLICANT_MONTHLY_INCOME_PRE__c !== undefined && co.COAPPLICANT_MONTHLY_INCOME_PRE__c !== null ? co.COAPPLICANT_MONTHLY_INCOME_PRE__c : '',
      co.RELATION_WITH_THE_COAPPLICANT_PRE__c || '',
      co.Co_Applicant_Occupation_PRE__c || '',
      co.Co_Applicant_age_pre__c !== undefined && co.Co_Applicant_age_pre__c !== null ? co.Co_Applicant_age_pre__c : '',
      co.Co_Applicant_s_Bank_Name_PRE__c || 'None',
      state || 'Unspecified',
      sfVal,
      verdict,
      eligibleStr,
      conditionalStr,
      ineligibleStr,
      topRec,
      reason
    ];

    csvRows.push(row.map(escapeCSV).join(','));

    processedData.push({
      academy: a,
      coApp: co,
      kycStatus,
      nbfcInApp,
      disbursedNBFC: a.Disbursed_NBFC_Name__c,
      sfVal,
      res,
      topRec,
      reason
    });
  }

  fs.writeFileSync('last_5_days_emi_setup_evaluated_no_pii.csv', csvRows.join('\r\n'), 'utf8');
  console.log(`Saved last_5_days_emi_setup_evaluated_no_pii.csv with ${csvRows.length - 1} records.`);

  console.log('\n--- 5-DAY AGGREGATE METRICS ---');
  console.log(JSON.stringify(stats, null, 2));

  // Write a JSON summary for inspection
  fs.writeFileSync('last_5_days_summary.json', JSON.stringify({ stats, processedCount: processedData.length }, null, 2));
})();
