const https = require('https');
const querystring = require('querystring');
const fs = require('fs');

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
  console.log('Connecting to Salesforce...');
  const auth = await getAccessToken();
  const token = auth.access_token;
  const instanceUrl = auth.instance_url;
  console.log('Authenticated successfully.');

  const data = require('./last_5_days_emi_leads_complete.json');
  console.log(`Total records to update: ${data.length}`);

  const updateRecords = [];
  for (const item of data) {
    const co = item.coApp;
    const res = item.res;
    const cibil = co.CIBIL_SCORE_RANGE_PRE__c || 'UNSPECIFIED';
    const income = co.COAPPLICANT_MONTHLY_INCOME_PRE__c || 0;
    const empType = item.empType || 'Unspecified';

    let reason = '';
    if (res.eligible_nbfcs.length > 0) {
      reason = `Approved for ${res.eligible_nbfcs.map(e => e.partner_name).join(', ')} on CIBIL ${cibil}, income INR ${income} (${empType}).`;
    } else if (res.conditional_nbfcs.length > 0) {
      const topReqs = res.conditional_nbfcs.slice(0, 2).map(c => `${c.partner_name}: ${c.missing_requirements?.[0] || 'Verification pending'}`).join('; ');
      reason = `Conditional approval subject to: ${topReqs}`;
    } else {
      reason = `Disqualified across lenders: ${res.ineligible_nbfcs[0]?.rejection_reasons?.[0] || 'Criteria not met'}`;
    }

    updateRecords.push({
      attributes: { type: 'Co_Applicant_PRE_Pipeline__c' },
      id: co.Id,
      Eligible_NBFCs_PRE__c: reason
    });
  }

  // Composite API allows up to 200 records per call. Since we have 150, we can do it in 1 batch.
  console.log('Sending composite PATCH request for 150 records...');
  const res = await sfCompositePatch(instanceUrl, updateRecords, token);
  console.log('Salesforce Response Status:', res.status);

  let successCount = 0;
  let failureCount = 0;
  const failureDetails = [];

  if (Array.isArray(res.data)) {
    res.data.forEach((r, idx) => {
      if (r.success) {
        successCount++;
      } else {
        failureCount++;
        failureDetails.push({ id: r.id, errors: r.errors });
      }
    });
  }

  console.log(`\n========================================`);
  console.log(`Update Summary:`);
  console.log(`Successfully updated: ${successCount} records`);
  console.log(`Failed: ${failureCount} records`);
  console.log(`========================================`);

  if (failureCount > 0) {
    console.log('Failure details:', JSON.stringify(failureDetails, null, 2));
  }

  fs.writeFileSync('salesforce_update_audit.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    totalAttempted: updateRecords.length,
    successCount,
    failureCount,
    failureDetails,
    sampleUpdated: updateRecords.slice(0, 5)
  }, null, 2));
  console.log('Saved salesforce_update_audit.json successfully.');
})();
