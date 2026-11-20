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

function sfPatch(instanceUrl, sobject, id, payload, token) {
  const parsed = new URL(instanceUrl);
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: parsed.hostname,
      port: 443,
      path: '/services/data/v60.0/sobjects/' + sobject + '/' + id,
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
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sfGet(instanceUrl, sobject, id, token) {
  const parsed = new URL(instanceUrl);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: parsed.hostname,
      port: 443,
      path: '/services/data/v60.0/sobjects/' + sobject + '/' + id + '?fields=Id,Name,Eligible_NBFCs_PRE__c',
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
  const testId = 'a0Cfv00001n50fHEAQ';

  console.log('1. Fetching current value before update:');
  const before = await sfGet(instanceUrl, 'Co_Applicant_PRE_Pipeline__c', testId, token);
  console.log('Before update:', before.body);

  console.log('\n2. Executing PATCH on Eligible_NBFCs_PRE__c...');
  const patchRes = await sfPatch(instanceUrl, 'Co_Applicant_PRE_Pipeline__c', testId, {
    Eligible_NBFCs_PRE__c: 'Northern_Arc, Fibe'
  }, token);
  console.log('Salesforce Response Code:', patchRes.status, '(204 means No Content / Success)');

  console.log('\n3. Re-fetching record from Salesforce to verify persistence:');
  const after = await sfGet(instanceUrl, 'Co_Applicant_PRE_Pipeline__c', testId, token);
  console.log('After update:', after.body);
})();
