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

function escapeCSVField(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function getReasonShort(lender, isConditional) {
  if (isConditional) {
    if (lender.pending_verifications && lender.pending_verifications.length > 0) {
      const v = lender.pending_verifications[0];
      if (v.includes('straddles')) return 'Needs exact CIBIL score';
    }
    if (lender.missing_requirements && lender.missing_requirements.length > 0) {
      return lender.missing_requirements[0].replace(/,/g, '');
    }
    return 'Pending verification';
  }

  const code = lender.reason_code;
  if (code === 'MINIMUM_INCOME_NOT_MET') {
    const fail = (lender.all_failures && lender.all_failures[0]) || {};
    return `Income < ₹${fail.required || 'min'}`;
  }
  if (code === 'MINIMUM_CIBIL_NOT_MET') return 'CIBIL score below cutoff';
  if (code === 'DISALLOWED_COAPPLICANT_RELATIONSHIP') return 'Relationship not accepted';
  if (code === 'RESTRICTED_GEOGRAPHY') return 'State not serviceable';
  if (code === 'DISALLOWED_COAPPLICANT_OCCUPATION') return 'Occupation not accepted';
  if (code === 'AGE_OUT_OF_BOUNDS') return 'Age out of bounds';
  if (code === 'DISALLOWED_BANK_TYPE') return 'Bank type not accepted';
  return (lender.reason_detail || code || 'Criteria not met').replace(/,/g, '');
}

const raw = fs.readFileSync('new_report.csv', 'utf8');
const rows = parseCSV(raw);
const headers = rows[0].map(h => h.trim());

console.log(`Original headers (${headers.length}):`, headers);
const outputHeaders = [...headers, 'Eligible NBFCs', 'Rejected NBFCs'];

const outputRows = [];
outputRows.push(outputHeaders.map(escapeCSVField).join(','));

let totalEligibleDecisions = 0;
let totalConditionalDecisions = 0;
let totalIneligibleDecisions = 0;

for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const payload = {};
  headers.forEach((h, idx) => { payload[h] = row[idx] ? row[idx].trim() : null; });

  const res = engine.evaluate(payload);

  const eligibleList = (res.eligible_nbfcs || []).map(e => e.partner_name);
  const eligibleStr = eligibleList.length > 0 ? eligibleList.join('; ') : 'None';
  if (eligibleList.length > 0) totalEligibleDecisions++;

  const rejectedList = [];
  (res.ineligible_nbfcs || []).forEach(inEl => {
    rejectedList.push(`${inEl.partner_name} (Rejected: ${getReasonShort(inEl, false)})`);
  });
  (res.conditional_nbfcs || []).forEach(cond => {
    rejectedList.push(`${cond.partner_name} (Conditional: ${getReasonShort(cond, true)})`);
  });

  const rejectedStr = rejectedList.length > 0 ? rejectedList.join('; ') : 'None';

  // Ensure row has exactly 13 original items
  const originalFields = [];
  for (let c = 0; c < headers.length; c++) {
    originalFields.push(row[c] !== undefined ? row[c] : '');
  }

  const finalRow = [...originalFields, eligibleStr, rejectedStr];
  outputRows.push(finalRow.map(escapeCSVField).join(','));
}

const finalCSV = outputRows.join('\r\n');
fs.writeFileSync('new_academy_report_evaluated_final.csv', finalCSV, 'utf8');

console.log(`Successfully generated new_academy_report_evaluated_final.csv!`);
console.log(`Total output lines: ${outputRows.length}`);
console.log(`Total applications evaluated: ${rows.length - 1}`);
console.log(`Sample first 3 rows:`);
for (let i = 0; i <= 3; i++) {
  console.log(`Row ${i}: ${outputRows[i].slice(0, 140)}...`);
}
