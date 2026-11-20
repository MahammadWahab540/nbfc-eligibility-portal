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

  const queries = [
    "SELECT count() FROM Academy_Onboarding_PRE__c WHERE Onboarding_Status__c = 'EMI Setup Done' AND LastModifiedDate = LAST_N_DAYS:2",
    "SELECT count() FROM Academy_Onboarding_PRE__c WHERE Onboarding_Status__c = 'EMI Setup Done' AND LastModifiedDate >= 2026-11-03T00:00:00Z",
    "SELECT count() FROM Academy_Onboarding_PRE__c WHERE Emi_Setup_Date_Time__c >= 2026-11-03T00:00:00Z",
    "SELECT count() FROM Academy_Onboarding_PRE__c WHERE EMI_Setup_Date_by_JODO__c >= 2026-11-03T00:00:00Z",
    "SELECT count() FROM Academy_Onboarding_PRE__c WHERE EMI_Setup_Done_Checkbox_PRE__c = true AND LastModifiedDate >= 2026-11-03T00:00:00Z"
  ];

  for (const q of queries) {
    const res = await sfQuery(instanceUrl, q, token);
    console.log(q, '->', res.body.totalSize);
  }

  // Let's sample a few records from Emi_Setup_Date_Time__c >= 2026-11-03T00:00:00Z and Onboarding_Status__c = 'EMI Setup Done'
  const sample = await sfQuery(instanceUrl, "SELECT Id, Name, userId__c, Onboarding_Status__c, Emi_Setup_Date_Time__c, EMI_Setup_Date_by_JODO__c, Choose_NBFC_PRE__c, Disbursed_NBFC_Name__c, Eligible_NBFCs_PRE__c, LastModifiedDate FROM Academy_Onboarding_PRE__c WHERE (Emi_Setup_Date_Time__c >= 2026-11-03T00:00:00Z OR EMI_Setup_Date_by_JODO__c >= 2026-11-03T00:00:00Z) ORDER BY LastModifiedDate DESC LIMIT 10", token);
  console.log('\nSample EMI Setup date records:');
  console.log(JSON.stringify(sample.body.records, null, 2));

  const sample2 = await sfQuery(instanceUrl, "SELECT Id, Name, userId__c, Onboarding_Status__c, Emi_Setup_Date_Time__c, Choose_NBFC_PRE__c, Disbursed_NBFC_Name__c, Eligible_NBFCs_PRE__c, LastModifiedDate FROM Academy_Onboarding_PRE__c WHERE Onboarding_Status__c = 'EMI Setup Done' AND LastModifiedDate = LAST_N_DAYS:2 ORDER BY LastModifiedDate DESC LIMIT 10", token);
  console.log('\nSample EMI Setup Done LastModifiedDate = LAST_N_DAYS:2 records:');
  console.log(JSON.stringify(sample2.body.records, null, 2));
})();
