/**
 * Test Runner for the new sub-sheet:
 * "New Academy Co - Applicant NBFC Report-2026-11-02-07-11-15"
 * Evaluates all 3,557 records against http://localhost:3000/api/v1/eligibility/evaluate
 */

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

const raw = fs.readFileSync('new_report.csv', 'utf8');
const rows = parseCSV(raw);
const headers = rows[0].map(h => h.trim());
const dataRows = rows.slice(1);

console.log(`Loaded ${dataRows.length} applications from "New Academy Co - Applicant NBFC Report-2026-11-02-07-11-15"`);
console.log('Headers detected:', headers);

function mapRowToPayload(row) {
  const payload = {};
  headers.forEach((h, idx) => {
    payload[h] = row[idx] ? row[idx].trim() : null;
  });
  return payload;
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
          resolve({ error: 'Parse Error', raw: body });
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runAudit() {
  const startTime = Date.now();
  console.log(`Sending payloads to http://localhost:3000/api/v1/eligibility/evaluate ...`);

  let successCount = 0;
  let errorCount = 0;
  const partnerCounts = {
    northern_arc: 0,
    fibe: 0,
    gyandhan: 0,
    auxilo: 0,
    techfino: 0,
    bajaj: 0
  };

  let eligibleAny = 0;
  let conditionalOnly = 0;
  let ineligibleAll = 0;

  // Ground truth check: was chosen lender among eligible or conditional?
  let chosenMatchCount = 0;
  let chosenTotalCount = 0;
  const chosenStats = {};

  const concurrency = 25;
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < dataRows.length) {
      const idx = currentIndex++;
      const row = dataRows[idx];
      const payload = mapRowToPayload(row);

      try {
        const response = await sendEvaluationRequest(payload);
        successCount++;

        const el = response.eligible_nbfcs || [];
        const cd = response.conditional_nbfcs || [];
        const inel = response.ineligible_nbfcs || [];

        if (el.length > 0) eligibleAny++;
        else if (cd.length > 0) conditionalOnly++;
        else ineligibleAll++;

        el.forEach(l => {
          if (partnerCounts[l.partner_id] !== undefined) partnerCounts[l.partner_id]++;
        });

        // Check ground truth chosen NBFC
        const chosen = payload['Choose NBFC'] || payload['NBFC Onboarding Name'];
        if (chosen) {
          chosenTotalCount++;
          const chosenNorm = chosen.toLowerCase();
          chosenStats[chosen] = (chosenStats[chosen] || 0) + 1;

          const matched =
            el.some(l => chosenNorm.includes(l.partner_id) || l.partner_name.toLowerCase().includes(chosenNorm)) ||
            cd.some(l => chosenNorm.includes(l.partner_id) || l.partner_name.toLowerCase().includes(chosenNorm));

          if (matched) chosenMatchCount++;
        }

        if (successCount % 500 === 0 || successCount === dataRows.length) {
          console.log(`Evaluated ${successCount} / ${dataRows.length} applications (${((successCount/dataRows.length)*100).toFixed(1)}%)...`);
        }
      } catch (err) {
        errorCount++;
        console.error(`Error on index ${idx}:`, err.message);
      }
    }
  }

  const workers = [];
  for (let w = 0; w < concurrency; w++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n======================================================');
  console.log('       NEW REPORT TAB AUDIT & EVALUATION RESULTS       ');
  console.log('======================================================');
  console.log(`Total Applications Evaluated: ${dataRows.length}`);
  console.log(`Successful API Responses:     ${successCount}`);
  console.log(`API Errors:                   ${errorCount}`);
  console.log(`Evaluation Duration:          ${durationSec}s (~${(successCount/durationSec).toFixed(0)} req/s)`);

  console.log('\n--- OVERALL DECISION CLASSIFICATION ---');
  console.log(`Eligible for >=1 NBFC:        ${eligibleAny} (${((eligibleAny/dataRows.length)*100).toFixed(1)}%)`);
  console.log(`Conditional (Needs Review):   ${conditionalOnly} (${((conditionalOnly/dataRows.length)*100).toFixed(1)}%)`);
  console.log(`Completely Ineligible:        ${ineligibleAll} (${((ineligibleAll/dataRows.length)*100).toFixed(1)}%)`);

  console.log('\n--- LENDER APPROVAL DISTRIBUTION ---');
  Object.entries(partnerCounts).forEach(([id, count]) => {
    console.log(`▶ ${id.toUpperCase()}: ${count} approved (${((count/dataRows.length)*100).toFixed(1)}%)`);
  });

  console.log('\n--- REAL PRODUCTION CHOSEN NBFC ALIGNMENT ---');
  console.log(`Total Records with Ground-Truth Choice: ${chosenTotalCount}`);
  console.log(`Chosen Lender Suggested by Engine:      ${chosenMatchCount} (${((chosenMatchCount/chosenTotalCount)*100).toFixed(1)}% match rate!)`);
  console.log('Breakdown of Chosen NBFCs in Dataset:', chosenStats);
}

runAudit().catch(console.error);
