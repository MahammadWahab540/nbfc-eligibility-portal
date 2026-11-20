const fs = require('fs');
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

const raw = fs.readFileSync('new_report.csv', 'utf8');
const rows = parseCSV(raw);
const headers = rows[0].map(h => h.trim());
const dataRows = rows.slice(1);

console.log(`Processing ${dataRows.length} applications...`);

const sampleResults = [];
for (let i = 0; i < 5; i++) {
  const row = dataRows[i];
  const payload = {};
  headers.forEach((h, idx) => { payload[h] = row[idx] ? row[idx].trim() : null; });

  const res = engine.evaluate(payload);
  const eligible = (res.eligible_nbfcs || []).map(l => l.partner_name);
  const conditional = (res.conditional_nbfcs || []).map(l => `${l.partner_name} (Review: ${l.reason_code || 'Pending verification'})`);
  const ineligible = (res.ineligible_nbfcs || []).map(l => `${l.partner_name} (Rejected: ${l.reason_code || 'Criteria not met'})`);

  const rejectedCombined = [...conditional, ...ineligible];

  sampleResults.push({
    user: payload.userId,
    name: payload['Academy PRE -Loan Journey Name'],
    cibil: payload['CIBIL Score Range'],
    income: payload['Co-Applicant Monthly Income'],
    eligible: eligible.length > 0 ? eligible.join('; ') : 'None',
    rejected: rejectedCombined.length > 0 ? rejectedCombined.join('; ') : 'None'
  });
}

console.log(JSON.stringify(sampleResults, null, 2));
