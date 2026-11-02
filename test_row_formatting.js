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

  // Ineligible
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

for (let i = 1; i <= 10; i++) {
  const row = rows[i];
  const payload = {};
  headers.forEach((h, idx) => { payload[h] = row[idx] ? row[idx].trim() : null; });
  const res = engine.evaluate(payload);

  const eligibleList = (res.eligible_nbfcs || []).map(e => e.partner_name);
  const eligibleStr = eligibleList.length > 0 ? eligibleList.join('; ') : 'None';

  const rejectedList = [];
  (res.ineligible_nbfcs || []).forEach(inEl => {
    rejectedList.push(`${inEl.partner_name} (Rejected: ${getReasonShort(inEl, false)})`);
  });
  (res.conditional_nbfcs || []).forEach(cond => {
    rejectedList.push(`${cond.partner_name} (Conditional: ${getReasonShort(cond, true)})`);
  });

  const rejectedStr = rejectedList.length > 0 ? rejectedList.join('; ') : 'None';

  console.log(`[Row ${i + 1}]`);
  console.log(`  User: ${payload.userId}`);
  console.log(`  Eligible: ${eligibleStr}`);
  console.log(`  Rejected: ${rejectedStr}`);
}
