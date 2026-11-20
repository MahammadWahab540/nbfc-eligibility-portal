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
  const soqlAc = `SELECT Id, Name, userId__c, Choose_NBFC_PRE__c, Disbursed_NBFC_Name__c, Eligible_NBFCs_PRE__c FROM Academy_Onboarding_PRE__c WHERE userId__c IN (${inClause})`;
  const acRecords = await sfQueryAll(auth.instance_url, soqlAc, auth.access_token);

  console.log('=== ACADEMY RECORDS CURRENT STATE ===');
  acRecords.forEach(a => {
    console.log(`${a.userId__c} | ${a.Id} (${a.Name}) | Disbursed: ${a.Disbursed_NBFC_Name__c} | Eligible: "${a.Eligible_NBFCs_PRE__c}"`);
  });

  const acIds = acRecords.map(a => `'${a.Id}'`).join(',');
  const soqlCo = `SELECT Id, Name, Academy_Onboarding_PRE__c, Eligible_NBFCs_PRE__c FROM Co_Applicant_PRE_Pipeline__c WHERE Academy_Onboarding_PRE__c IN (${acIds})`;
  const coRecords = await sfQueryAll(auth.instance_url, soqlCo, auth.access_token);

  console.log('\n=== CO-APPLICANT RECORDS CURRENT STATE ===');
  coRecords.forEach(c => {
    console.log(`${c.Academy_Onboarding_PRE__c} | ${c.Id} (${c.Name}) | Eligible: "${c.Eligible_NBFCs_PRE__c}"`);
  });
})();
