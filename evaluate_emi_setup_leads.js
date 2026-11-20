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

  console.log('1. Querying Academy_Onboarding_PRE__c records with EMI Setup in last 2 days...');
  
  // Specific query for recent EMI Setup
  const soqlAcademy = `SELECT Id, Name, userId__c, PHONE_NUMBER__c, Email_PRE__c, Onboarding_Status__c, Emi_Setup_Date_Time__c, EMI_Setup_Date_by_JODO__c, EMI_Setup_Done_Checkbox_PRE__c, Choose_NBFC_PRE__c, Disbursed_NBFC_Name__c, Eligible_NBFCs_PRE__c, Co_Applicant_State_PRE__c, LastModifiedDate FROM Academy_Onboarding_PRE__c WHERE (Emi_Setup_Date_Time__c = LAST_N_DAYS:2 OR (Onboarding_Status__c = 'EMI Setup Done' AND LastModifiedDate = LAST_N_DAYS:2)) ORDER BY Emi_Setup_Date_Time__c DESC NULLS LAST, LastModifiedDate DESC`;

  const academyRecords = await sfQueryAll(instanceUrl, soqlAcademy, token);
  console.log('Fetched Academy records:', academyRecords.length);

  const academyIds = academyRecords.map(r => "'" + r.Id + "'");
  console.log('Academy IDs count:', academyIds.length);

  // Chunk academy IDs for querying Co_Applicant_PRE_Pipeline__c
  const chunkSize = 200;
  let coAppRecords = [];
  for (let i = 0; i < academyIds.length; i += chunkSize) {
    const chunk = academyIds.slice(i, i + chunkSize);
    const soqlCoApp = `SELECT Id, Name, Academy_Onboarding_PRE__c, CIBIL_SCORE_RANGE_PRE__c, COAPPLICANT_MONTHLY_INCOME_PRE__c, Co_Applicant_s_Bank_Name_PRE__c, RELATION_WITH_THE_COAPPLICANT_PRE__c, Co_Applicant_Occupation_PRE__c, Co_Applicant_age_pre__c, Co_Applicant_state_pre__c, NAME_mismatch_in_Adhaar_and_PAN__c, DOB_mismatch_in_Adhaar_and_PAN__c, PAN_and_Adhaar_is_to_be_linked__c, E_Pan_Physical_PAN_Availability__c, Eligible_NBFCs_PRE__c, KYC_SUBMISSION_STATUS_PRE__c, KYC_SUBMISSION_DATE_AND_TIME_PRE__c, LastModifiedDate FROM Co_Applicant_PRE_Pipeline__c WHERE Academy_Onboarding_PRE__c IN (${chunk.join(',')})`;
    const res = await sfQueryAll(instanceUrl, soqlCoApp, token);
    coAppRecords = coAppRecords.concat(res);
  }
  console.log('Fetched Co_Applicant records:', coAppRecords.length);

  const coAppMap = new Map();
  for (const c of coAppRecords) {
    // If multiple coapps exist for one academy ID, keep the most recently modified
    if (!coAppMap.has(c.Academy_Onboarding_PRE__c)) {
      coAppMap.set(c.Academy_Onboarding_PRE__c, c);
    }
  }

  // Evaluate each record
  const evaluated = [];
  for (const a of academyRecords) {
    const coApp = coAppMap.get(a.Id) || {};
    const state = coApp.Co_Applicant_state_pre__c || a.Co_Applicant_State_PRE__c || null;

    const payload = {
      CIBIL_SCORE_RANGE_PRE__c: coApp.CIBIL_SCORE_RANGE_PRE__c,
      COAPPLICANT_MONTHLY_INCOME_PRE__c: coApp.COAPPLICANT_MONTHLY_INCOME_PRE__c,
      Co_Applicant_s_Bank_Name_PRE__c: coApp.Co_Applicant_s_Bank_Name_PRE__c,
      RELATION_WITH_THE_COAPPLICANT_PRE__c: coApp.RELATION_WITH_THE_COAPPLICANT_PRE__c,
      Co_Applicant_Occupation_PRE__c: coApp.Co_Applicant_Occupation_PRE__c,
      Co_Applicant_age_pre__c: coApp.Co_Applicant_age_pre__c,
      State: state,
      Co_Applicant_state_pre__c: state,
      parameter_questions: {
        has_name_mismatch: coApp.NAME_mismatch_in_Adhaar_and_PAN__c === 'Yes',
        has_dob_mismatch: coApp.DOB_mismatch_in_Adhaar_and_PAN__c === 'Yes',
        is_pan_aadhaar_linked: coApp.PAN_and_Adhaar_is_to_be_linked__c !== 'No',
        has_e_pan_or_physical_pan: coApp.E_Pan_Physical_PAN_Availability__c !== 'No'
      }
    };

    const res = engine.evaluate(payload);
    evaluated.push({
      academy: a,
      coApp,
      res
    });
  }

  console.log('Evaluated total:', evaluated.length);

  // Focus on records where Emi_Setup_Date_Time__c was in the last 2 days
  const freshEmiSetups = evaluated.filter(e => e.academy.Emi_Setup_Date_Time__c && (new Date(e.academy.Emi_Setup_Date_Time__c) >= new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)));
  console.log('Records with Emi_Setup_Date_Time__c strictly in last 48 hours:', freshEmiSetups.length);

  fs.writeFileSync('last_2_days_emi_leads.json', JSON.stringify(evaluated, null, 2));

  console.log('\n--- SAMPLE RECENT STRICT EMI SETUP LEADS (Last 48 hours) ---');
  freshEmiSetups.slice(0, 10).forEach((item, idx) => {
    console.log(`[#${idx+1}] ${item.academy.Name} (User: ${item.academy.userId__c})`);
    console.log(`   EMI Setup Date: ${item.academy.Emi_Setup_Date_Time__c}`);
    console.log(`   Chosen NBFC: ${item.academy.Choose_NBFC_PRE__c} | Disbursed NBFC: ${item.academy.Disbursed_NBFC_Name__c}`);
    console.log(`   Current SF Eligible: ${item.academy.Eligible_NBFCs_PRE__c || item.coApp.Eligible_NBFCs_PRE__c}`);
    console.log(`   Underwriting: CIBIL=${item.coApp.CIBIL_SCORE_RANGE_PRE__c || 'N/A'}, Income=${item.coApp.COAPPLICANT_MONTHLY_INCOME_PRE__c || 'N/A'}, Rel=${item.coApp.RELATION_WITH_THE_COAPPLICANT_PRE__c || 'N/A'}, Occ=${item.coApp.Co_Applicant_Occupation_PRE__c || 'N/A'}`);
    console.log(`   Algo Eligible: ${item.res.eligible_nbfcs.map(e => e.partner_name).join(', ') || 'None'}`);
    console.log(`   Algo Conditional: ${item.res.conditional_nbfcs.map(c => c.partner_name).join(', ') || 'None'}`);
    console.log(`   Algo Ineligible: ${item.res.ineligible_nbfcs.map(i => i.partner_name).join(', ') || 'None'}`);
    console.log('----------------------------------------------------');
  });
})();
