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

function sfQuery(instanceUrl, soql, token) {
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
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(postData = '');
    req.end();
  });
}

(async () => {
  const auth = await getAccessToken();
  const sfData = require('./fresh_150_sf_data.json');
  
  // Pick 10 sample academy IDs from the 150
  const sampleIds = sfData.academyRecords.slice(0, 10).map(r => `'${r.Id}'`).join(',');
  const soql1 = `SELECT Id, Name, Eligible_NBFCs_PRE__c, Disbursed_NBFC_Name__c, LastModifiedDate FROM Academy_Onboarding_PRE__c WHERE Id IN (${sampleIds})`;
  const res1 = await sfQuery(auth.instance_url, soql1, auth.access_token);
  
  console.log('=== SAMPLE 10 LIVE ACADEMY RECORDS IN SALESFORCE (FROM 150 COHORT) ===');
  (res1.records || []).forEach((r, idx) => {
    console.log(`[#${idx+1}] ID: ${r.Id} | Disbursed: ${r.Disbursed_NBFC_Name__c} | Eligible: ${r.Eligible_NBFCs_PRE__c} | LastModified: ${r.LastModifiedDate}`);
  });

  // Check co-applicant records as well
  const sampleCoAppIds = sfData.coAppRecords.slice(0, 5).map(r => `'${r.Id}'`).join(',');
  const soql2 = `SELECT Id, Academy_Onboarding_PRE__c, Eligible_NBFCs_PRE__c, LastModifiedDate FROM Co_Applicant_PRE_Pipeline__c WHERE Id IN (${sampleCoAppIds})`;
  const res2 = await sfQuery(auth.instance_url, soql2, auth.access_token);
  
  console.log('\n=== SAMPLE 5 LIVE CO-APPLICANT RECORDS IN SALESFORCE ===');
  (res2.records || []).forEach((r, idx) => {
    console.log(`[#${idx+1}] ID: ${r.Id} | Academy: ${r.Academy_Onboarding_PRE__c} | Modified: ${r.LastModifiedDate}\n     Decision: ${r.Eligible_NBFCs_PRE__c}`);
  });

  // Count total Gyandhan matches in the 150 cohort
  const evalData = require('./evaluated_150_after_fixes.json');
  const gyanDisbursed = sfData.academyRecords.filter(r => r.Disbursed_NBFC_Name__c === 'GYANDHAN');
  console.log(`\nTotal Gyandhan disbursed in 150 cohort: ${gyanDisbursed.length}`);
  
  const gyanAcademyIds = gyanDisbursed.map(r => `'${r.Id}'`).join(',');
  const soqlGyan = `SELECT Id, Name, Eligible_NBFCs_PRE__c, Disbursed_NBFC_Name__c FROM Academy_Onboarding_PRE__c WHERE Id IN (${gyanAcademyIds})`;
  const resGyan = await sfQuery(auth.instance_url, soqlGyan, auth.access_token);
  
  let gyanEligibleCount = 0;
  console.log('\n=== ALL GYANDHAN DISBURSED LEADS IN 150 COHORT (LIVE SALESFORCE) ===');
  (resGyan.records || []).forEach((r, idx) => {
    const isEligible = (r.Eligible_NBFCs_PRE__c || '').includes('Gyandhan') || (r.Eligible_NBFCs_PRE__c || '').includes('GYANDHAN');
    if (isEligible) gyanEligibleCount++;
    console.log(`[#${idx+1}] ID: ${r.Id} | Name: ${r.Name} | Match: ${isEligible ? 'YES' : 'NO'} | Eligible: ${r.Eligible_NBFCs_PRE__c}`);
  });
  console.log(`\nGyandhan Live Match Rate in SF: ${gyanEligibleCount} / ${gyanDisbursed.length} (${((gyanEligibleCount/gyanDisbursed.length)*100).toFixed(1)}%)`);
})();
