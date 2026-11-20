const https = require('https');
const querystring = require('querystring');
const fs = require('fs');
const NBFCEligibilityEngine = require('./src/engine/index');

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
  console.log('     RE-RUN NBFC ELIGIBILITY ENGINE & UPDATE SALESFORCE (150 LEADS)   ');
  console.log('======================================================================');

  const engine = new NBFCEligibilityEngine();
  const sfData = require('./fresh_150_sf_data.json');
  const existing150 = require('./last_5_days_emi_leads_complete.json');

  const academyMap = new Map();
  sfData.academyRecords.forEach(a => academyMap.set(a.Id, a));

  const coAppMap = new Map();
  sfData.coAppRecords.forEach(c => {
    coAppMap.set(c.Id, c);
  });

  const beforeEligibleCounts = {
    'Northern Arc': 87,
    'Fibe': 89,
    'Auxilo': 7,
    'Gyandhan': 0,
    'Techfino': 0,
    'Bajaj Finserv': 0
  };

  const afterEligibleCounts = {
    'Northern Arc': 0,
    'Fibe': 0,
    'Auxilo': 0,
    'Gyandhan': 0,
    'Techfino': 0,
    'Bajaj Finserv': 0
  };

  const updateRecords = [];
  const updatedEvaluations = [];

  for (let i = 0; i < existing150.length; i++) {
    const item = existing150[i];
    const a = academyMap.get(item.academy.Id) || item.academy;
    const co = coAppMap.get(item.coApp.Id) || item.coApp;

    // Multi-tier State resolution: Academy State__c -> CoApp State -> Academy CoApp State
    const resolvedState = a.State__c || co.Co_Applicant_state_pre__c || a.Co_Applicant_State_PRE__c || null;
    const empType = co.Co_Applicant_Employment_Type_PRE__c || a.Co_Applicant_Employment_Type_PRE__c || item.empType || 'Unspecified';
    const cibil = co.CIBIL_SCORE_RANGE_PRE__c || 'UNSPECIFIED';
    const income = co.COAPPLICANT_MONTHLY_INCOME_PRE__c || 0;

    const payload = {
      Id: co.Id,
      salesforce_id: co.Id,
      userId: a.userId__c || null,
      Name: a.Name,
      CIBIL_SCORE_RANGE_PRE__c: cibil,
      COAPPLICANT_MONTHLY_INCOME_PRE__c: income,
      Co_Applicant_s_Bank_Name_PRE__c: co.Co_Applicant_s_Bank_Name_PRE__c,
      RELATION_WITH_THE_COAPPLICANT_PRE__c: co.RELATION_WITH_THE_COAPPLICANT_PRE__c,
      Co_Applicant_Occupation_PRE__c: co.Co_Applicant_Occupation_PRE__c,
      Co_Applicant_Employment_Type_PRE__c: empType,
      Co_Applicant_age_pre__c: co.Co_Applicant_age_pre__c,
      State: resolvedState,
      Co_Applicant_state_pre__c: resolvedState,
      parameter_questions: {
        has_name_mismatch: co.NAME_mismatch_in_Adhaar_and_PAN__c === 'Yes',
        has_dob_mismatch: co.DOB_mismatch_in_Adhaar_and_PAN__c === 'Yes',
        is_pan_aadhaar_linked: co.PAN_and_Adhaar_is_to_be_linked__c !== 'No',
        has_e_pan_or_physical_pan: co.E_Pan_Physical_PAN_Availability__c !== 'No',
        has_door_number: true // In preliminary evaluation or relaxed
      }
    };

    const res = engine.evaluate(payload);

    res.eligible_nbfcs.forEach(e => {
      if (afterEligibleCounts[e.partner_name] !== undefined) {
        afterEligibleCounts[e.partner_name]++;
      }
    });

    let reason = '';
    if (res.eligible_nbfcs.length > 0) {
      const eligibleNames = res.eligible_nbfcs.map(e => e.partner_name).join(', ');
      reason = `Approved for ${eligibleNames} on CIBIL ${cibil}, income INR ${income} (${empType}).`;
    } else if (res.conditional_nbfcs.length > 0) {
      const topReqs = res.conditional_nbfcs.slice(0, 2).map(c => `${c.partner_name}: ${c.missing_requirements?.[0] || 'Verification pending'}`).join('; ');
      reason = `Conditional approval subject to: ${topReqs}`;
    } else {
      reason = `Disqualified across lenders: ${res.ineligible_nbfcs[0]?.failures?.[0]?.detail || 'Criteria not met'}`;
    }

    updateRecords.push({
      attributes: { type: 'Co_Applicant_PRE_Pipeline__c' },
      id: co.Id,
      Eligible_NBFCs_PRE__c: reason
    });

    updatedEvaluations.push({
      leadIndex: i + 1,
      academyId: a.Id,
      coAppId: co.Id,
      state: resolvedState,
      cibil,
      income,
      empType,
      eligible_nbfcs: res.eligible_nbfcs.map(e => ({ name: e.partner_name, rank: e.rank, priority: e.priority })),
      conditional_nbfcs: res.conditional_nbfcs.map(c => ({ name: c.partner_name, next_action: c.recommended_next_action })),
      reason
    });
  }

  console.log('\n--- BEFORE VS AFTER ELIGIBILITY COUNTS (150 LEADS) ---');
  console.log('Lender          | Before Fix | After Fix | Delta');
  console.log('----------------|------------|-----------|------');
  Object.keys(afterEligibleCounts).forEach(lender => {
    const before = beforeEligibleCounts[lender] || 0;
    const after = afterEligibleCounts[lender] || 0;
    const delta = (after >= before ? '+' : '') + (after - before);
    console.log(`${lender.padEnd(16)}| ${String(before).padStart(10)} | ${String(after).padStart(9)} | ${delta}`);
  });

  // Verify Techfino and Gyandhan counts
  console.log(`\nTechfino Eligible: ${afterEligibleCounts['Techfino']} (Previous: ${beforeEligibleCounts['Techfino']})`);
  console.log(`Gyandhan Eligible: ${afterEligibleCounts['Gyandhan']} (Previous: ${beforeEligibleCounts['Gyandhan']})`);

  // Connect to Salesforce and execute composite update
  console.log('\nConnecting to Salesforce to sync updates...');
  const auth = await getAccessToken();
  console.log('Authenticated successfully with Salesforce.');

  console.log(`Sending composite PATCH for ${updateRecords.length} records...`);
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
  console.log('SALESFORCE SYNC AUDIT SUMMARY');
  console.log('======================================================================');
  console.log(`Total Leads Processed : ${updateRecords.length}`);
  console.log(`Successful Updates    : ${successCount}`);
  console.log(`Failures              : ${failureCount}`);
  console.log('======================================================================');

  if (failureCount > 0) {
    console.error('Failed Records:', JSON.stringify(failureDetails, null, 2));
  }

  fs.writeFileSync('evaluated_150_after_fixes.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    metrics: {
      totalLeads: updateRecords.length,
      successCount,
      failureCount,
      beforeEligibleCounts,
      afterEligibleCounts
    },
    evaluations: updatedEvaluations
  }, null, 2));
  console.log('Saved evaluated_150_after_fixes.json successfully.');
})();
