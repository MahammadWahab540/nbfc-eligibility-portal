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
  const leads = require('./last_5_days_emi_leads_complete.json');
  const academyIds = leads.map(l => `'${l.academy.Id}'`);

  const req = https.request({
    hostname: new URL(auth.instance_url).hostname,
    port: 443,
    path: `/services/data/v60.0/query?q=` + encodeURIComponent(`SELECT Id, State__c, City_Town_Village__c, Co_Applicant_Address_PRE__c, Co_Applicant_State_PRE__c FROM Academy_Onboarding_PRE__c WHERE Id IN (${academyIds.slice(0, 100).join(',')})`),
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + auth.access_token }
  }, res => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
      const records = JSON.parse(data).records || [];
      let stateCount = 0;
      let coAppStateCount = 0;
      let cityCount = 0;
      let addrCount = 0;
      records.forEach(r => {
        if (r.State__c) stateCount++;
        if (r.Co_Applicant_State_PRE__c) coAppStateCount++;
        if (r.City_Town_Village__c) cityCount++;
        if (r.Co_Applicant_Address_PRE__c) addrCount++;
      });
      console.log('Sample 100 records:');
      console.log('State__c populated:', stateCount);
      console.log('Co_Applicant_State_PRE__c populated:', coAppStateCount);
      console.log('City_Town_Village__c populated:', cityCount);
      console.log('Co_Applicant_Address_PRE__c populated:', addrCount);
      console.log('Sample records with State__c:');
      console.log(records.filter(r => r.State__c).slice(0, 5));
    });
  });
  req.end();
})();
