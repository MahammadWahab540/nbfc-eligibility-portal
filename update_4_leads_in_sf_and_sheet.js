const https = require('https');
const querystring = require('querystring');
const fs = require('fs');
const { execSync } = require('child_process');

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
  console.log('     UPDATING THE 4 DRILLED-DOWN LEADS IN SALESFORCE CRM              ');
  console.log('======================================================================');

  const updates = [
    // 1. Lead 1: Dangeti satyanaraya swamy (FEEMONK & Northern Arc)
    {
      attributes: { type: 'Academy_Onboarding_PRE__c' },
      id: 'a03IT00001HY55cYAD',
      Eligible_NBFCs_PRE__c: 'Feemonk, Northern Arc, Fibe'
    },
    {
      attributes: { type: 'Co_Applicant_PRE_Pipeline__c' },
      id: 'a0Cfv00005irhXlEAI',
      Eligible_NBFCs_PRE__c: 'Approved for Feemonk, Northern Arc, Fibe on CIBIL 700 - 900, income INR 70000 (SELF_EMPLOYED). Disbursed with Feemonk.'
    },

    // 2. Lead 2: Vaishnavi Sandeep Ganesh (NORTHERN_ARC & JODO_FLEX)
    {
      attributes: { type: 'Academy_Onboarding_PRE__c' },
      id: 'a03IT00001HY2Z6YAL',
      Eligible_NBFCs_PRE__c: 'Northern Arc, Jodo Flex'
    },
    {
      attributes: { type: 'Academy_Onboarding_PRE__c' },
      id: 'a03IT00001HY3Y0YAL',
      Eligible_NBFCs_PRE__c: 'Northern Arc, Jodo Flex'
    },
    {
      attributes: { type: 'Co_Applicant_PRE_Pipeline__c' },
      id: 'a0CIT00001vvklD2AQ',
      Eligible_NBFCs_PRE__c: 'Approved for Northern Arc, Jodo Flex under surrogate NTC underwriting. Disbursed with Northern Arc.'
    },

    // 3. Lead 3: Pratiksha (BAJAJ_FINANCE_LIMITED)
    {
      attributes: { type: 'Academy_Onboarding_PRE__c' },
      id: 'a03fv00000TvPV6AAN',
      Eligible_NBFCs_PRE__c: 'Bajaj Finserv, Northern Arc, Fibe'
    },
    {
      attributes: { type: 'Co_Applicant_PRE_Pipeline__c' },
      id: 'a0Cfv00004muSo5EAE',
      Eligible_NBFCs_PRE__c: 'Approved for Bajaj Finserv, Northern Arc, Fibe on CIBIL 700 - 900, income INR 30000 (SELF_EMPLOYED). Verified CIBIL >= 721, disbursed with Bajaj Finance Limited.'
    },

    // 4. Lead 4: Linu Lijo (GYANDHAN)
    {
      attributes: { type: 'Academy_Onboarding_PRE__c' },
      id: 'a03fv00000Z1oxxAAB',
      Eligible_NBFCs_PRE__c: 'Gyandhan, Northern Arc, Auxilo, Fibe, Techfino'
    },
    {
      attributes: { type: 'Co_Applicant_PRE_Pipeline__c' },
      id: 'a0Cfv00005Zo8IvEAJ',
      Eligible_NBFCs_PRE__c: 'Approved for Gyandhan, Northern Arc, Auxilo, Fibe, Techfino on CIBIL 700 - 900, income INR 300000 (PRIVATE_EMPLOYEE). Verified salary slips/ITR, disbursed with Gyandhan.'
    }
  ];

  console.log(`Sending PATCH for ${updates.length} records...`);
  const auth = await getAccessToken();
  console.log('Authenticated successfully with Salesforce.');

  const res = await sfCompositePatch(auth.instance_url, updates, auth.access_token);
  console.log('Salesforce Response Status:', res.status);
  console.log('Response Details:');
  console.log(JSON.stringify(res.data, null, 2));

  let successCount = 0;
  if (Array.isArray(res.data)) {
    res.data.forEach(r => { if (r.success) successCount++; });
  }

  console.log(`\nSuccessfully updated ${successCount} of ${updates.length} records in Salesforce!`);

  // Now update Google Sheet CSV
  console.log('\nUpdating Google Sheet CSV file...');
  const csvPath = 'last_5_days_emi_setup_evaluated_no_pii.csv';
  let csvContent = fs.readFileSync(csvPath, 'utf8');

  // Lead 1: Dangeti satyanaraya swamy
  csvContent = csvContent.replace(
    /788da375-f0b8-423c-b95d-e4ddc29e7280,a03IT00001HY55cYAD,([^,]+),([^,]+),([^,]+),([^,]+),FEEMONK,FEEMONK,([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),(.*)/,
    '788da375-f0b8-423c-b95d-e4ddc29e7280,a03IT00001HY55cYAD,$1,$2,$3,$4,FEEMONK,FEEMONK,$5,$6,$7,$8,$9,$10,$11,"Feemonk, Northern Arc, Fibe",ELIGIBLE,"Feemonk, Northern Arc, Fibe",None,None,Feemonk,"Approved for Feemonk, Northern Arc, Fibe on CIBIL 700 - 900, income INR 70000 (SELF_EMPLOYED). Disbursed with Feemonk."'
  );

  // Lead 2: Vaishnavi Sandeep Ganesh
  csvContent = csvContent.replace(
    /07d0733f-6886-44b0-9bf8-e1a13aae9841,a03IT00001HY2Z6YAL,([^,]+),([^,]+),([^,]+),([^,]+),NORTHERN_ARC,NORTHERN_ARC,([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),(.*)/,
    '07d0733f-6886-44b0-9bf8-e1a13aae9841,a03IT00001HY2Z6YAL,$1,$2,$3,$4,NORTHERN_ARC,NORTHERN_ARC,$5,$6,$7,$8,$9,$10,$11,"Northern Arc, Jodo Flex",ELIGIBLE,"Northern Arc, Jodo Flex",None,None,Northern Arc,"Approved for Northern Arc, Jodo Flex under surrogate NTC underwriting. Disbursed with Northern Arc."'
  );

  // Lead 3: Pratiksha (Bajaj)
  csvContent = csvContent.replace(
    /cdd4b482-586f-4e3e-90ae-9b0173c14294,a03fv00000TvPV6AAN,([^,]+),([^,]+),([^,]+),([^,]+),BAJAJ_FINANCE_LIMITED,BAJAJ_FINANCE_LIMITED,([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),(.*)/,
    'cdd4b482-586f-4e3e-90ae-9b0173c14294,a03fv00000TvPV6AAN,$1,$2,$3,$4,BAJAJ_FINANCE_LIMITED,BAJAJ_FINANCE_LIMITED,$5,$6,$7,$8,$9,$10,$11,"Bajaj Finserv, Northern Arc, Fibe",ELIGIBLE,"Bajaj Finserv, Northern Arc, Fibe",None,None,Bajaj Finserv,"Approved for Bajaj Finserv, Northern Arc, Fibe on CIBIL 700 - 900, income INR 30000 (SELF_EMPLOYED). Verified CIBIL >= 721, disbursed with Bajaj Finance Limited."'
  );

  // Lead 4: Linu Lijo (Gyandhan)
  csvContent = csvContent.replace(
    /d6e9115b-f1f1-4516-919e-80f9243d60c2,a03fv00000Z1oxxAAB,([^,]+),([^,]+),([^,]+),([^,]+),GYANDHAN,GYANDHAN,([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),(.*)/,
    'd6e9115b-f1f1-4516-919e-80f9243d60c2,a03fv00000Z1oxxAAB,$1,$2,$3,$4,GYANDHAN,GYANDHAN,$5,$6,$7,$8,$9,$10,$11,"Gyandhan, Northern Arc, Auxilo, Fibe, Techfino",ELIGIBLE,"Gyandhan, Northern Arc, Auxilo, Fibe, Techfino",None,None,Gyandhan,"Approved for Gyandhan, Northern Arc, Auxilo, Fibe, Techfino on CIBIL 700 - 900, income INR 300000 (PRIVATE_EMPLOYEE). Verified salary slips/ITR, disbursed with Gyandhan."'
  );

  fs.writeFileSync(csvPath, csvContent, 'utf8');
  console.log('Saved updated CSV. Now syncing to Google Sheet 1_bMX1Xz7UFZZiNd7anc0fhT0GvqdrtCZSzCEcWtSlwc...');

  try {
    execSync(`gsheets mutate import-csv 1_bMX1Xz7UFZZiNd7anc0fhT0GvqdrtCZSzCEcWtSlwc ${csvPath}`, { stdio: 'inherit' });
    console.log('Google Sheet updated successfully!');
  } catch (err) {
    console.error('Google Sheet update note:', err.message);
  }
})();
