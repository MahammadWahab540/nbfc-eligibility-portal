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
    req.end();
  });
}

(async () => {
  const auth = await getAccessToken();
  const soql = "SELECT Id, Name, userId__c, Choose_NBFC_PRE__c, Disbursed_NBFC_Name__c, Eligible_NBFCs_PRE__c, LastModifiedDate FROM Academy_Onboarding_PRE__c WHERE userId__c IN ('cdd4b482-586f-4e3e-90ae-9b0173c14294', 'd6e9115b-f1f1-4516-919e-80f9243d60c2')";
  const data = await sfQuery(auth.instance_url, soql, auth.access_token);
  console.log('--- TARGET DRILL DOWN LEADS VERIFICATION ---');
  data.records.forEach((r, idx) => {
    console.log('[#' + (idx + 1) + '] ID: ' + r.Id + ' | User: ' + r.userId__c + ' | Disbursed: ' + r.Disbursed_NBFC_Name__c);
    console.log('    Eligible NBFCs: ' + r.Eligible_NBFCs_PRE__c);
  });
})();
