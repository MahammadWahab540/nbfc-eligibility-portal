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

(async () => {
  const auth = await getAccessToken();
  const soql = "SELECT Id, Name, Disbursed_NBFC_Name__c, Eligible_NBFCs_PRE__c, LastModifiedDate FROM Academy_Onboarding_PRE__c WHERE Id = 'a03fv00000UmMPVAA3'";
  const req = https.request({
    hostname: 'computing-ability-6555.my.salesforce.com',
    port: 443,
    path: '/services/data/v60.0/query?q=' + encodeURIComponent(soql),
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + auth.access_token,
      'Content-Type': 'application/json'
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      const parsed = JSON.parse(data);
      console.log('--- VERIFIED LIVE SALESFORCE RECORD FOR TECHFINO LEAD ---');
      console.log(JSON.stringify(parsed.records[0], null, 2));
    });
  });
  req.end();
})();
