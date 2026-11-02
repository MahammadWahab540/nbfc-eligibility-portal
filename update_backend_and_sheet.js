const fs = require('fs');
const { execSync } = require('child_process');
const NBFCEligibilityEngine = require('./src/engine/index');

const engine = new NBFCEligibilityEngine();

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

const raw = fs.readFileSync('new_report.csv', 'utf8');
const rows = parseCSV(raw);
const headers = rows[0].map(h => h.trim());

console.log(`Loaded ${rows.length - 1} records from new_report.csv.`);

// Exactly the user's requested 3 column headers:
// Eligible NBFCs, Conditional NBFCs, rejected NBFCs
const outputHeaders = [
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
  'Current Team',
  'Eligible NBFCs',
  'Conditional NBFCs',
  'rejected NBFCs'
];

const outputRows = [outputHeaders.map(escapeCSVField).join(',')];

let countEligible = 0;
let countConditional = 0;
let countIneligible = 0;

for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const payload = {};
  headers.forEach((h, idx) => { payload[h] = row[idx] ? row[idx].trim() : null; });

  // Evaluate payload through backend engine
  const res = engine.evaluate(payload);

  if (res.eligible_nbfcs.length > 0) countEligible++;
  else if (res.conditional_nbfcs.length > 0) countConditional++;
  else countIneligible++;

  // 1. Eligible NBFCs
  const eligibleStr = res.eligible_nbfcs.map(e => e.partner_name).join('; ') || 'None';

  // 2. Conditional NBFCs
  const conditionalStr = res.conditional_nbfcs.map(c => {
    const req = c.missing_requirements?.[0] || c.reason_code || 'Pending verification';
    return `${c.partner_name} (${req.replace(/,/g, '')})`;
  }).join('; ') || 'None';

  // 3. rejected NBFCs
  const rejectedStr = res.ineligible_nbfcs.map(iEl => {
    const fail = iEl.failures?.[0] || iEl.reason_code || 'Criteria not met';
    return `${iEl.partner_name} (${fail.replace(/,/g, '')})`;
  }).join('; ') || 'None';

  const baseFields = [
    payload.userId || '',
    payload['Academy PRE -Loan Journey Name'] || '',
    payload['NBFC Onboarding Name'] || '',
    payload['Choose NBFC'] || '',
    payload['CIBIL Score Range'] || '',
    payload['Relation with the Co-Applicant'] || '',
    payload['Co applicant Occupation'] || '',
    payload['Co-Applicant Occupation Other'] || '',
    payload['Co-Applicant Age'] || '',
    payload.State || '',
    payload['Co-Applicant Monthly Income'] || '',
    payload['Co-Applicant Monthly Income Value'] || '',
    payload['Current Team'] || ''
  ];

  const fullRow = [...baseFields, eligibleStr, conditionalStr, rejectedStr];
  outputRows.push(fullRow.map(escapeCSVField).join(','));
}

const finalCSV = outputRows.join('\r\n');
fs.writeFileSync('new_academy_subsheet_payload_updated.csv', finalCSV, 'utf8');
console.log(`Generated new_academy_subsheet_payload_updated.csv (${outputRows.length} lines).`);
console.log(`Summary: Eligible: ${countEligible}, Conditional: ${countConditional}, Ineligible: ${countIneligible}`);

// Write to Google Sheets
const sheetId = '1dSYa0AXRxSGNbUD3tENCp0jsY6BMfu8btwGy0V_VDFo';
const tabName = 'New Academy Co - Applicant NBFC Report-2026-11-02-07-11-15';

console.log(`Importing into Google Sheet: tab "${tabName}"...`);
try {
  const out = execSync(`gsheets mutate import-csv ${sheetId} new_academy_subsheet_payload_updated.csv --sheet "${tabName}"`, {
    encoding: 'utf8'
  });
  console.log('Google Sheets Import Output:', out.trim());
} catch (err) {
  console.error('Error importing into Google Sheets:', err.message);
  if (err.stdout) console.log('Stdout:', err.stdout);
  if (err.stderr) console.error('Stderr:', err.stderr);
  process.exit(1);
}
