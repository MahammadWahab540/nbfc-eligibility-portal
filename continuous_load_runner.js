const fs = require('fs');
const http = require('http');

function parseCSV(content) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentField);
      if (currentRow.length > 1 || currentRow[0] !== '') {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  return rows;
}

const raw = fs.readFileSync('nbfc_sheet_exported.csv', 'utf8');
const rows = parseCSV(raw);
const dataRows = rows.slice(1);

function mapRowToPayload(row) {
  const userId = row[0] || 'unknown-user';
  const sfId = row[1] || '';
  const name = row[2] || 'Applicant';
  const cibilRange = row[3] || '';
  const relation = row[4] || '';
  const monthlyIncome = parseFloat(row[6]) || 0;
  const occupation = row[7] || 'OTHER';
  const state = row[8] || '';
  const age = parseInt(row[9], 10) || null;
  const bankName = row[10] || 'OTHER';

  return {
    event_type: 'KYC_SUBMISSION',
    user_details: {
      user_id: userId,
      salesforce_id: sfId,
      phone_number: '9999999999'
    },
    co_applicant_details: {
      name: name,
      age: age !== null ? String(age) : null,
      state: state,
      city: '',
      relation: relation,
      email: `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}@example.com`
    },
    cibil_details: {
      cibil_score_range: cibilRange
    },
    employment_details: {
      employment_type: 'SALARIED',
      monthly_income: monthlyIncome,
      occupation: occupation
    },
    bank_details: {
      bank_name: bankName
    },
    address_details: {
      door_number: '1-100',
      state: state
    },
    parameter_questions: {
      is_pan_aadhaar_linked: true,
      has_e_pan_or_physical_pan: true,
      has_dob_mismatch: false,
      has_name_mismatch: false,
      has_door_number: true
    },
    selected_emi_tenure: 36
  };
}

function sendEvaluationRequest(payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/eligibility/evaluate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve(true));
    });

    req.on('error', (err) => resolve(false));
    req.write(postData);
    req.end();
  });
}

async function startContinuousStream(durationMinutes = 60) {
  console.log(`[CONTINUOUS LOAD] Starting continuous test stream for ${durationMinutes} minutes...`);
  const stopTime = Date.now() + durationMinutes * 60 * 1000;
  let totalRequests = 0;
  let cycle = 1;

  while (Date.now() < stopTime) {
    console.log(`[CYCLE ${cycle}] Starting iteration over 2866 records...`);
    for (let i = 0; i < dataRows.length; i++) {
      if (Date.now() >= stopTime) break;
      const payload = mapRowToPayload(dataRows[i]);
      await sendEvaluationRequest(payload);
      totalRequests++;

      // Small pacing delay: 50ms per request (~20 requests/sec, evenly spaced over 1 hour)
      await new Promise(r => setTimeout(r, 60));
    }
    console.log(`[CYCLE ${cycle}] Completed. Total requests sent so far: ${totalRequests}`);
    cycle++;
  }

  console.log(`[CONTINUOUS LOAD] Finished. Total requests processed over stream: ${totalRequests}`);
}

startContinuousStream(60).catch(console.error);
