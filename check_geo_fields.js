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

function describeObject(instanceUrl, token, objName) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: new URL(instanceUrl).hostname,
      port: 443,
      path: `/services/data/v60.0/sobjects/${objName}/describe`,
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  try {
    const auth = await getAccessToken();
    const acDesc = await describeObject(auth.instance_url, auth.access_token, 'Academy_Onboarding_PRE__c');
    console.log('=== Academy_Onboarding_PRE__c Address/State/City/Pin Fields ===');
    const acGeo = acDesc.fields.filter(f => 
      f.name.toLowerCase().includes('state') || 
      f.name.toLowerCase().includes('city') || 
      f.name.toLowerCase().includes('pin') ||
      f.name.toLowerCase().includes('address') ||
      f.name.toLowerCase().includes('location')
    ).map(f => `${f.name} (${f.label}, ${f.type})`);
    console.log(acGeo.join('\n'));

    const coDesc = await describeObject(auth.instance_url, auth.access_token, 'Co_Applicant_PRE_Pipeline__c');
    console.log('\n=== Co_Applicant_PRE_Pipeline__c Address/State/City/Pin Fields ===');
    const coGeo = coDesc.fields.filter(f => 
      f.name.toLowerCase().includes('state') || 
      f.name.toLowerCase().includes('city') || 
      f.name.toLowerCase().includes('pin') ||
      f.name.toLowerCase().includes('address') ||
      f.name.toLowerCase().includes('location')
    ).map(f => `${f.name} (${f.label}, ${f.type})`);
    console.log(coGeo.join('\n'));
  } catch (err) {
    console.error('Error:', err);
  }
})();
