const https = require('https');
const querystring = require('querystring');

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
  const path = '/services/data/v60.0/query?q=' + encodeURIComponent(soql);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: parsed.hostname,
      port: 443,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const auth = await getAccessToken();
  const token = auth.access_token;
  const instanceUrl = auth.instance_url;

  console.log('Testing queries...');
  const qList = [
    "SELECT count() FROM Academy_Onboarding_PRE__c WHERE Emi_Setup_Date_Time__c = LAST_N_DAYS:2",
    "SELECT count() FROM Academy_Onboarding_PRE__c WHERE Emi_Setup_Date_Time__c = TODAY OR Emi_Setup_Date_Time__c = YESTERDAY",
    "SELECT count() FROM Academy_Onboarding_PRE__c WHERE Onboarding_Status__c = 'EMI Setup'",
    "SELECT count() FROM Academy_Onboarding_PRE__c WHERE Onboarding_Status__c LIKE '%EMI%'",
    "SELECT count() FROM Academy_Onboarding_PRE__c WHERE EMI_Setup_Done_Checkbox_PRE__c = true AND LastModifiedDate = LAST_N_DAYS:2",
    "SELECT count() FROM Co_Applicant_PRE_Pipeline__c WHERE ONBOARDING_STAGE_PRE__c LIKE '%EMI%'"
  ];

  for (const q of qList) {
    const res = await sfQuery(instanceUrl, q, token);
    console.log(q);
    console.log(' -> totalSize:', res.body.totalSize, res.body.message || '');
  }

  // Also let's check picklist values of Onboarding_Status__c
  const desc = await sfQuery(instanceUrl, "SELECT Onboarding_Status__c, count(Id) FROM Academy_Onboarding_PRE__c GROUP BY Onboarding_Status__c", token);
  console.log('\nAcademy_Onboarding_PRE__c Onboarding_Status__c groups:');
  console.log(desc.body.records);
})();
