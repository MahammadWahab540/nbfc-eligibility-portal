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

console.log(`Loaded ${dataRows.length} records to evaluate.`);

// Map row to evaluation payload
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
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve({ error: 'Failed to parse JSON', raw: body });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

async function runBatch() {
  const startTime = Date.now();
  console.log(`Starting evaluation against http://localhost:3000/api/v1/eligibility/evaluate ...`);

  const results = [];
  const concurrency = 25;
  let index = 0;
  let successfulRequests = 0;
  let errorRequests = 0;

  async function worker() {
    while (index < dataRows.length) {
      const currentIndex = index++;
      const row = dataRows[currentIndex];
      const payload = mapRowToPayload(row);

      try {
        const response = await sendEvaluationRequest(payload);
        results.push({
          row_index: currentIndex + 1,
          salesforce_id: row[1],
          user_id: row[0],
          name: row[2],
          input: {
            cibilRange: row[3],
            relation: row[4],
            income: parseFloat(row[6]) || 0,
            occupation: row[7],
            state: row[8],
            age: parseInt(row[9], 10) || null,
            bank: row[10]
          },
          response: response
        });
        successfulRequests++;
        if (successfulRequests % 500 === 0 || successfulRequests === dataRows.length) {
          console.log(`Evaluated ${successfulRequests} / ${dataRows.length} records (${((successfulRequests/dataRows.length)*100).toFixed(1)}%)...`);
        }
      } catch (err) {
        errorRequests++;
        console.error(`Error on row ${currentIndex + 1}:`, err.message);
      }
    }
  }

  const workers = [];
  for (let w = 0; w < concurrency; w++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\nCompleted evaluation in ${durationSec}s. Success: ${successfulRequests}, Errors: ${errorRequests}`);

  fs.writeFileSync('batch_results.json', JSON.stringify(results, null, 2), 'utf8');
  console.log(`Saved full results to batch_results.json`);
}

runBatch().catch(console.error);
