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
  const targetIds = [
    'a03IT00001HY55cYAD',
    'a03IT00001HY2Z6YAL',
    'a03fv00000TvPV6AAN',
    'a03fv00000Z1oxxAAB'
  ];
  const inClause = targetIds.map(id => `'${id}'`).join(',');
  const soql = `SELECT Id, Name, userId__c, Choose_NBFC_PRE__c, Disbursed_NBFC_Name__c, Eligible_NBFCs_PRE__c, LastModifiedDate FROM Academy_Onboarding_PRE__c WHERE Id IN (${inClause})`;

  const req = https.request({
    hostname: new URL(auth.instance_url).hostname,
    port: 443,
    path: `/services/data/v60.0/query?q=` + encodeURIComponent(soql),
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + auth.access_token }
  }, res => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
      const records = JSON.parse(data).records || [];
      console.log('Live Verification of Updated Records from Salesforce:');
      records.forEach(r => {
        console.log(`\nLead: ${r.Name} (${r.userId__c})`);
        console.log(`Disbursed NBFC : ${r.Disbursed_NBFC_Name__c}`);
        console.log(`Eligible NBFCs : ${r.Eligible_NBFCs_PRE__c}`);
        console.log(`Last Modified  : ${r.LastModifiedDate}`);
      });
    });
  });
  req.end();
})();
