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
  const evalData = require('./evaluated_150_after_fixes.json');
  const bothQualifying = evalData.evaluations.filter(e => 
    e.eligible_nbfcs.some(n => n.name === 'Techfino') && 
    e.eligible_nbfcs.some(n => n.name === 'Gyandhan')
  );

  console.log(`Checking 5 sample records from Salesforce where both Techfino and Gyandhan qualified...`);
  const sampleIds = bothQualifying.slice(0, 5).map(s => `'${s.coAppId}'`);

  const req = https.request({
    hostname: new URL(auth.instance_url).hostname,
    port: 443,
    path: `/services/data/v60.0/query?q=` + encodeURIComponent(`SELECT Id, Eligible_NBFCs_PRE__c, LastModifiedDate FROM Co_Applicant_PRE_Pipeline__c WHERE Id IN (${sampleIds.join(',')})`),
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + auth.access_token }
  }, res => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
      const records = JSON.parse(data).records || [];
      records.forEach(r => {
        console.log(`\nRecord ID: ${r.Id}`);
        console.log(`Last Modified: ${r.LastModifiedDate}`);
        console.log(`Stored Field Value: ${r.Eligible_NBFCs_PRE__c}`);
      });
    });
  });
  req.end();
})();
