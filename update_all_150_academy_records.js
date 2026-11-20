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
  console.log('======================================================================');
  console.log('       SYNC GOOGLE SHEET ALGO EVALUATIONS TO SALESFORCE ACADEMY       ');
  console.log('======================================================================');

  const evalData = require('./evaluated_150_after_fixes.json');
  console.log(`Total evaluations loaded: ${evalData.evaluations.length}`);

  const updateRecords = [];
  evalData.evaluations.forEach(ev => {
    let eligibleStr = 'None Eligible';
    if (ev.eligible_nbfcs && ev.eligible_nbfcs.length > 0) {
      eligibleStr = ev.eligible_nbfcs.map(e => e.name).join(', ');
    }

    updateRecords.push({
      attributes: { type: 'Academy_Onboarding_PRE__c' },
      id: ev.academyId,
      Eligible_NBFCs_PRE__c: eligibleStr
    });
  });

  console.log(`Prepared ${updateRecords.length} records for Academy_Onboarding_PRE__c update.`);
  console.log('\nSample 5 records to be updated:');
  console.log(JSON.stringify(updateRecords.slice(0, 5), null, 2));

  console.log('\nAuthenticating with Salesforce...');
  const auth = await getAccessToken();
  console.log('Authenticated successfully.');

  console.log(`Sending Composite PATCH for ${updateRecords.length} Academy records...`);
  const patchRes = await sfCompositePatch(auth.instance_url, updateRecords, auth.access_token);
  console.log('Salesforce Response Status:', patchRes.status);

  let successCount = 0;
  let failureCount = 0;
  const failureDetails = [];

  if (Array.isArray(patchRes.data)) {
    patchRes.data.forEach((r, idx) => {
      if (r.success) {
        successCount++;
      } else {
        failureCount++;
        failureDetails.push({ id: r.id, errors: r.errors });
      }
    });
  }

  console.log('\n======================================================================');
  console.log('ACADEMY ONBOARDING SALESFORCE SYNC AUDIT');
  console.log('======================================================================');
  console.log(`Total Records Attempted: ${updateRecords.length}`);
  console.log(`Successfully Updated  : ${successCount}`);
  console.log(`Failures              : ${failureCount}`);
  console.log('======================================================================');

  if (failureCount > 0) {
    console.error('Failed Records:', JSON.stringify(failureDetails, null, 2));
  }

  fs.writeFileSync('academy_salesforce_update_audit.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    totalAttempted: updateRecords.length,
    successCount,
    failureCount,
    failureDetails,
    samples: updateRecords.slice(0, 5)
  }, null, 2));
  console.log('Saved academy_salesforce_update_audit.json successfully.');
})();
