const https = require('https');
const querystring = require('querystring');
const fs = require('fs');

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
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: parsed.hostname,
      port: 443,
      path: '/services/data/v60.0/query?q=' + encodeURIComponent(soql),
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data).records || []); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const auth = await getAccessToken();
  const targetUserIds = [
    '788da375-f0b8-423c-b95d-e4ddc29e7280',
    '07d0733f-6886-44b0-9bf8-e1a13aae9841',
    'cdd4b482-586f-4e3e-90ae-9b0173c14294',
    'd6e9115b-f1f1-4516-919e-80f9243d60c2'
  ];

  const inClause = targetUserIds.map(u => `'${u}'`).join(',');
  console.log('Querying Academy records for user IDs:', targetUserIds);

  const soqlAcademy = `SELECT Id, Name, userId__c, PHONE_NUMBER__c, Email_PRE__c, Onboarding_Status__c, Emi_Setup_Date_Time__c, KYC_Submission_Status_PRE__c, KYC_Submission_Date_and_Time_PRE__c, Choose_NBFC_PRE__c, Disbursed_NBFC_Name__c, Eligible_NBFCs_PRE__c, State__c, City_Town_Village__c, Co_Applicant_Address_PRE__c, Co_Applicant_State_PRE__c, Co_Applicant_Employment_Type_PRE__c, NBFC_Call_Remarks_PRE__c, Remarks_For_Bank_Dependency_in_NBFC_PRE__c, Active_NBFC_Records__c, Previous_NBFC__c, Total_Discount_NBFC_Other_PRE__c, NBFC_Status__c, Post_Approval_For_NBFC__c, Application_Creation_in_NBFC_PRE__c FROM Academy_Onboarding_PRE__c WHERE userId__c IN (${inClause})`;

  const academyRecords = await sfQueryAll(auth.instance_url, soqlAcademy, auth.access_token);
  console.log(`Found ${academyRecords.length} Academy records.`);

  const academyIds = academyRecords.map(a => `'${a.Id}'`).join(',');
  let coAppRecords = [];
  if (academyRecords.length > 0) {
    const soqlCoApp = `SELECT Id, Name, Academy_Onboarding_PRE__c, CIBIL_SCORE_RANGE_PRE__c, COAPPLICANT_MONTHLY_INCOME_PRE__c, Co_Applicant_s_Bank_Name_PRE__c, RELATION_WITH_THE_COAPPLICANT_PRE__c, Co_Applicant_Occupation_PRE__c, Co_Applicant_Employment_Type_PRE__c, Co_Applicant_age_pre__c, Co_Applicant_state_pre__c, NAME_mismatch_in_Adhaar_and_PAN__c, DOB_mismatch_in_Adhaar_and_PAN__c, PAN_and_Adhaar_is_to_be_linked__c, E_Pan_Physical_PAN_Availability__c, Eligible_NBFCs_PRE__c, KYC_SUBMISSION_STATUS_PRE__c, KYC_SUBMISSION_DATE_AND_TIME_PRE__c, CHOOSE_NBFC_PRE__c, REASONS_FOR_SELECTING_JODO_PRE__c, RCA_Rejection_Reason__c, COAPP_COMPANY_NAME_PRE__c, RESIDENCE_TYPE_PRE__c, RESIDENCE_YEARS_PRE__c FROM Co_Applicant_PRE_Pipeline__c WHERE Academy_Onboarding_PRE__c IN (${academyIds})`;
    coAppRecords = await sfQueryAll(auth.instance_url, soqlCoApp, auth.access_token);
    console.log(`Found ${coAppRecords.length} Co_Applicant records.`);
  }

  fs.writeFileSync('drill_down_4_leads.json', JSON.stringify({ academyRecords, coAppRecords }, null, 2));
  console.log('Saved drill_down_4_leads.json successfully.');
})();
