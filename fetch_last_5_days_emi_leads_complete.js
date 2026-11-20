const https = require('https');
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

(async () => {
  const auth = await getAccessToken();
  const token = auth.access_token;
  const instanceUrl = auth.instance_url;

  console.log('Querying Academy records where Emi_Setup_Date_Time__c = LAST_N_DAYS:5...');
  const soqlAcademy = `SELECT Id, Name, userId__c, PHONE_NUMBER__c, Email_PRE__c, Onboarding_Status__c, Emi_Setup_Date_Time__c, KYC_Submission_Status_PRE__c, KYC_Submission_Date_and_Time_PRE__c, Choose_NBFC_PRE__c, Disbursed_NBFC_Name__c, Eligible_NBFCs_PRE__c, Co_Applicant_State_PRE__c, Co_Applicant_Employment_Type_PRE__c, LastModifiedDate FROM Academy_Onboarding_PRE__c WHERE Emi_Setup_Date_Time__c = LAST_N_DAYS:5 ORDER BY Emi_Setup_Date_Time__c DESC`;

  const academyRecords = await sfQueryAll(instanceUrl, soqlAcademy, token);
  console.log('Fetched Academy records count:', academyRecords.length);

  const academyIds = academyRecords.map(r => `'${r.Id}'`);
  let coAppRecords = [];
  const chunkSize = 200;
  for (let i = 0; i < academyIds.length; i += chunkSize) {
    const chunk = academyIds.slice(i, i + chunkSize);
    const soqlCoApp = `SELECT Id, Name, Academy_Onboarding_PRE__c, CIBIL_SCORE_RANGE_PRE__c, COAPPLICANT_MONTHLY_INCOME_PRE__c, Co_Applicant_s_Bank_Name_PRE__c, RELATION_WITH_THE_COAPPLICANT_PRE__c, Co_Applicant_Occupation_PRE__c, Co_Applicant_Employment_Type_PRE__c, Co_Applicant_age_pre__c, Co_Applicant_state_pre__c, NAME_mismatch_in_Adhaar_and_PAN__c, DOB_mismatch_in_Adhaar_and_PAN__c, PAN_and_Adhaar_is_to_be_linked__c, E_Pan_Physical_PAN_Availability__c, Eligible_NBFCs_PRE__c, KYC_SUBMISSION_STATUS_PRE__c, KYC_SUBMISSION_DATE_AND_TIME_PRE__c FROM Co_Applicant_PRE_Pipeline__c WHERE Academy_Onboarding_PRE__c IN (${chunk.join(',')})`;
    const res = await sfQueryAll(instanceUrl, soqlCoApp, token);
    coAppRecords = coAppRecords.concat(res);
  }
  console.log('Fetched Co_Applicant records count:', coAppRecords.length);

  const coAppMap = new Map();
  for (const c of coAppRecords) {
    if (!coAppMap.has(c.Academy_Onboarding_PRE__c)) {
      coAppMap.set(c.Academy_Onboarding_PRE__c, c);
    }
  }

  const evaluated = [];
  for (const a of academyRecords) {
    const co = coAppMap.get(a.Id) || {};
    const state = co.Co_Applicant_state_pre__c || a.Co_Applicant_State_PRE__c || null;
    const empType = co.Co_Applicant_Employment_Type_PRE__c || a.Co_Applicant_Employment_Type_PRE__c || null;

    // Run local engine
    const payload = {
      CIBIL_SCORE_RANGE_PRE__c: co.CIBIL_SCORE_RANGE_PRE__c,
      COAPPLICANT_MONTHLY_INCOME_PRE__c: co.COAPPLICANT_MONTHLY_INCOME_PRE__c,
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
        has_e_pan_or_physical_pan: co.E_Pan_Physical_PAN_Availability__c !== 'No'
      }
    };

    const res = engine.evaluate(payload);

    // If employment type is explicitly non-earning (Student / Homemaker), check if lender criteria blocks
    const isNonEarning = empType && (empType.toLowerCase().includes('student') || empType.toLowerCase().includes('homemaker') || empType.toLowerCase().includes('housewife'));

    let verdict = 'INELIGIBLE';
    if (res.eligible_nbfcs.length > 0) verdict = 'ELIGIBLE';
    else if (res.conditional_nbfcs.length > 0) verdict = 'CONDITIONAL';

    evaluated.push({
      academy: a,
      coApp: co,
      empType,
      isNonEarning,
      res,
      verdict
    });
  }

  console.log('Evaluated records count:', evaluated.length);
  fs.writeFileSync('last_5_days_emi_leads_complete.json', JSON.stringify(evaluated, null, 2));
  console.log('Saved last_5_days_emi_leads_complete.json');
})();
