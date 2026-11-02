const fs = require('fs');
const http = require('http');
const { execSync } = require('child_process');

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

function escapeCSVField(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function mapLenderName(raw) {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  if (s.includes('GYANDHAN')) return 'gyandhan';
  if (s.includes('BAJAJ')) return 'bajaj';
  if (s.includes('AUXILO')) return 'auxilo';
  if (s.includes('FIBE')) return 'fibe';
  if (s.includes('NORTHERN')) return 'northern_arc';
  if (s.includes('TECHFINO')) return 'techfino';
  return null;
}

// HTTP Agent with keep-alive for high performance
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 25 });

function sendEvaluationRequest(payload, retries = 3) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request('http://localhost:3000/api/evaluate', {
      method: 'POST',
      agent: httpAgent,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`JSON Parse Error: ${e.message}`));
          }
        } else {
          if (retries > 0) {
            setTimeout(() => {
              sendEvaluationRequest(payload, retries - 1).then(resolve).catch(reject);
            }, 200);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        }
      });
    });

    req.on('error', (err) => {
      if (retries > 0) {
        setTimeout(() => {
          sendEvaluationRequest(payload, retries - 1).then(resolve).catch(reject);
        }, 200);
      } else {
        reject(err);
      }
    });

    req.write(body);
    req.end();
  });
}

async function run() {
  console.log('Loading co_applicant_new.csv...');
  const raw = fs.readFileSync('co_applicant_new.csv', 'utf8');
  const rows = parseCSV(raw);
  const headers = rows[0].map(h => h.trim());

  console.log(`Headers found (${headers.length}):`, headers);
  const dataRows = rows.slice(1);
  console.log(`Total records to evaluate: ${dataRows.length}`);

  // Summary statistics
  let totalEvaluated = 0;
  let totalSuccessful = 0;
  let totalFailed = 0;

  const decisionStats = {
    eligible_count: 0,
    conditional_count: 0,
    ineligible_count: 0
  };

  const lenderRejectionBreakdown = {
    northern_arc: 0,
    bajaj: 0,
    auxilo: 0,
    fibe: 0,
    gyandhan: 0,
    techfino: 0
  };

  const lenderEligibleBreakdown = {
    northern_arc: 0,
    bajaj: 0,
    auxilo: 0,
    fibe: 0,
    gyandhan: 0,
    techfino: 0
  };

  const lenderConditionalBreakdown = {
    northern_arc: 0,
    bajaj: 0,
    auxilo: 0,
    fibe: 0,
    gyandhan: 0,
    techfino: 0
  };

  const disbursementContradictions = [];
  const conditionalAuditRecords = [];
  const evaluatedRows = [];

  // Concurrency worker queue
  const CONCURRENCY = 15;
  let currentIndex = 0;

  console.log(`Starting bulk evaluation via HTTP API (concurrency: ${CONCURRENCY})...`);
  const startTime = Date.now();

  async function worker(workerId) {
    while (currentIndex < dataRows.length) {
      const idx = currentIndex++;
      const row = dataRows[idx];

      const payload = {};
      headers.slice(0, 15).forEach((h, colIdx) => {
        payload[h] = row[colIdx] ? row[colIdx].trim() : null;
      });

      try {
        const res = await sendEvaluationRequest(payload);
        totalSuccessful++;

        if (res.eligible_nbfcs && res.eligible_nbfcs.length > 0) decisionStats.eligible_count++;
        else if (res.conditional_nbfcs && res.conditional_nbfcs.length > 0) decisionStats.conditional_count++;
        else decisionStats.ineligible_count++;

        // Lender breakdowns
        (res.eligible_nbfcs || []).forEach(e => {
          if (lenderEligibleBreakdown[e.partner_id] !== undefined) lenderEligibleBreakdown[e.partner_id]++;
        });
        (res.conditional_nbfcs || []).forEach(c => {
          if (lenderConditionalBreakdown[c.partner_id] !== undefined) lenderConditionalBreakdown[c.partner_id]++;
        });
        (res.ineligible_nbfcs || []).forEach(iEl => {
          if (lenderRejectionBreakdown[iEl.partner_id] !== undefined) lenderRejectionBreakdown[iEl.partner_id]++;
        });

        // 1. Column P: Rejected (Ineligible lenders with failure reasons)
        const rejectedLenders = (res.ineligible_nbfcs || []).map(iEl => {
          const failReason = iEl.failures?.[0] || iEl.reason_code || 'Criteria not met';
          return `${iEl.partner_name} (${failReason.replace(/,/g, '')})`;
        });
        const rejectedStr = rejectedLenders.length > 0 ? rejectedLenders.join('; ') : 'None';

        // 2. Column Q: elibile (Eligible lenders)
        const eligibleLenders = (res.eligible_nbfcs || []).map(e => e.partner_name);
        const eligibleStr = eligibleLenders.length > 0 ? eligibleLenders.join('; ') : 'None';

        // 3. Keep CONDITIONAL separate in audit record
        const conditionalLenders = (res.conditional_nbfcs || []).map(c => {
          const pending = c.missing_requirements?.[0] || c.reason_code || 'Pending verification';
          return `${c.partner_name} (${pending.replace(/,/g, '')})`;
        });
        if (conditionalLenders.length > 0) {
          conditionalAuditRecords.push({
            row_number: idx + 2,
            userId: payload.userId,
            applicant_name: payload['Academy PRE -Loan Journey Name'],
            conditional_nbfcs: conditionalLenders
          });
        }

        // 4. Check disbursement contradiction against NBFC Status
        const onboardingLender = mapLenderName(payload['NBFC Onboarding Name'] || payload['Choose NBFC']);
        if (payload['NBFC Status'] === 'Disbursed' && onboardingLender) {
          const wasRejected = (res.ineligible_nbfcs || []).find(l => l.partner_id === onboardingLender);
          if (wasRejected) {
            disbursementContradictions.push({
              row_number: idx + 2,
              userId: payload.userId,
              applicant_name: payload['Academy PRE -Loan Journey Name'],
              applied_lender: onboardingLender,
              status: payload['NBFC Status'],
              cibil: payload['CIBIL Score Range'],
              income: payload['Co-Applicant Monthly Income'],
              rejection_reason: wasRejected.reason_code,
              detail: wasRejected.reason_detail
            });
          }
        }

        // Preserve all original 15 fields (Cols A to O)
        const preservedBaseFields = [];
        for (let col = 0; col < 15; col++) {
          preservedBaseFields.push(row[col] !== undefined ? row[col] : '');
        }

        // Append Column P (Rejected) and Column Q (elibile)
        const fullOutputRow = [...preservedBaseFields, rejectedStr, eligibleStr];
        evaluatedRows[idx] = fullOutputRow;

      } catch (err) {
        totalFailed++;
        console.error(`Row ${idx + 2} (UID ${payload.userId}) failed: ${err.message}`);
        // Fallback preserving original
        const preservedBaseFields = [];
        for (let col = 0; col < 15; col++) {
          preservedBaseFields.push(row[col] !== undefined ? row[col] : '');
        }
        evaluatedRows[idx] = [...preservedBaseFields, 'Evaluation Error', 'None'];
      }

      totalEvaluated++;
      if (totalEvaluated % 500 === 0 || totalEvaluated === dataRows.length) {
        console.log(`Evaluated ${totalEvaluated}/${dataRows.length} (${((totalEvaluated/dataRows.length)*100).toFixed(1)}%)...`);
      }
    }
  }

  // Launch workers
  const workers = [];
  for (let w = 0; w < CONCURRENCY; w++) {
    workers.push(worker(w));
  }
  await Promise.all(workers);

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\nEvaluation complete in ${durationSec}s!`);
  console.log(`Total Evaluated: ${totalEvaluated}`);
  console.log(`Total Successful: ${totalSuccessful}`);
  console.log(`Total Failed: ${totalFailed}`);

  // Build output CSV
  // Header: A to O original + Column P (Rejected) + Column Q (elibile)
  const finalCSVHeaders = [
    'userId',
    'Academy PRE -Loan Journey Name',
    'NBFC Onboarding Name',
    'Choose NBFC',
    'CIBIL Score Range',
    'Relation with the Co-Applicant',
    'Co applicant Occupation',
    'Co-Applicant Occupation Other',
    'Co-Applicant Age',
    'State',
    'Co-Applicant Monthly Income',
    'Co-Applicant Monthly Income Value',
    'NBFC Status',
    'Current Team',
    "Co-Applicant's Bank Name",
    'Rejected',
    'elibile'
  ];

  const finalCSVRows = [finalCSVHeaders.map(escapeCSVField).join(',')];
  for (let i = 0; i < evaluatedRows.length; i++) {
    finalCSVRows.push(evaluatedRows[i].map(escapeCSVField).join(','));
  }

  const finalCSVContent = finalCSVRows.join('\r\n');
  fs.writeFileSync('co_applicant_new_evaluated.csv', finalCSVContent, 'utf8');
  console.log(`Saved co_applicant_new_evaluated.csv (${finalCSVRows.length} lines).`);

  // Write audit JSONs
  const auditReport = {
    timestamp: new Date().toISOString(),
    total_leads_tested: dataRows.length,
    successful_evaluations: totalSuccessful,
    failed_evaluations: totalFailed,
    execution_time_seconds: parseFloat(durationSec),
    decision_summary: decisionStats,
    lender_eligible_breakdown: lenderEligibleBreakdown,
    lender_conditional_breakdown: lenderConditionalBreakdown,
    lender_rejection_breakdown: lenderRejectionBreakdown,
    disbursement_contradictions_count: disbursementContradictions.length,
    disbursement_contradictions: disbursementContradictions
  };

  fs.writeFileSync('co_applicant_new_audit_report.json', JSON.stringify(auditReport, null, 2), 'utf8');
  fs.writeFileSync('co_applicant_new_disbursed_contradictions.json', JSON.stringify(disbursementContradictions, null, 2), 'utf8');
  fs.writeFileSync('co_applicant_new_conditional_audit.json', JSON.stringify(conditionalAuditRecords.slice(0, 100), null, 2), 'utf8');

  console.log('\n--- Decision Summary ---');
  console.log(decisionStats);
  console.log('\n--- Lender Rejection Breakdown ---');
  console.table(lenderRejectionBreakdown);
  console.log('\n--- Lender Eligible Breakdown ---');
  console.table(lenderEligibleBreakdown);
  console.log(`\nDisbursement Contradictions Count: ${disbursementContradictions.length}`);

  // Import directly into Google Sheet
  const sheetId = '1dSYa0AXRxSGNbUD3tENCp0jsY6BMfu8btwGy0V_VDFo';
  const tabName = 'co-applicant -new';
  console.log(`\nImporting into Google Sheet: sheet "${tabName}"...`);
  try {
    const out = execSync(`gsheets mutate import-csv ${sheetId} co_applicant_new_evaluated.csv --sheet "${tabName}"`, {
      encoding: 'utf8'
    });
    console.log('Google Sheets Import Output:', out.trim());
  } catch (err) {
    console.error('Error importing into Google Sheets:', err.message);
    if (err.stdout) console.log('Stdout:', err.stdout);
    if (err.stderr) console.error('Stderr:', err.stderr);
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
