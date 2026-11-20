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

function sfCompositePatch(instanceUrl, records, token) {
  const parsed = new URL(instanceUrl);
  const payload = {
    allOrNone: false,
    records: records
  };
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: parsed.hostname,
      port: 443,
      path: '/services/data/v60.0/composite/sobjects',
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
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  const auth = await getAccessToken();
  const token = auth.access_token;
  const instanceUrl = auth.instance_url;

  // Test composite with 1 sample record
  const data = require('./last_5_days_emi_leads_complete.json');
  const sample = data[0];
  console.log('Sample coApp ID:', sample.coApp.Id);

  const reason = sample.res.eligible_nbfcs.length > 0 
    ? `Approved for ${sample.res.eligible_nbfcs.map(e => e.partner_name).join(', ')} on CIBIL ${sample.coApp.CIBIL_SCORE_RANGE_PRE__c || 'N/A'}, income INR ${sample.coApp.COAPPLICANT_MONTHLY_INCOME_PRE__c || 0} (${sample.empType || 'Unspecified'}).`
    : (sample.res.conditional_nbfcs.length > 0
        ? `Conditional approval subject to: ${sample.res.conditional_nbfcs.slice(0, 2).map(c => `${c.partner_name}: ${c.missing_requirements?.[0] || 'Verification pending'}`).join('; ')}`
        : `Disqualified across lenders: ${sample.res.ineligible_nbfcs[0]?.rejection_reasons?.[0] || 'Criteria not met'}`);

  console.log('Reason to update:', reason);

  const testRecords = [{
    attributes: { type: 'Co_Applicant_PRE_Pipeline__c' },
    id: sample.coApp.Id,
    Eligible_NBFCs_PRE__c: reason
  }];

  const res = await sfCompositePatch(instanceUrl, testRecords, token);
  console.log('Composite PATCH result status:', res.status);
  console.log('Composite response:', JSON.stringify(res.data, null, 2));
})();
