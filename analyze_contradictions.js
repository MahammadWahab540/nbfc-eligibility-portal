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

const prodRaw = fs.readFileSync('prod_data.csv', 'utf8');
const rows = parseCSV(prodRaw);
const headers = rows[0].map(h => h.trim());

const disbursedHardRejections = [];
const disbursedConditionals = [];
const disbursedEligibles = [];
const noLenderMapped = [];

const hardRejectionsByLender = {};
const hardRejectionsByReason = {};

for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const payload = {};
  headers.forEach((h, idx) => { payload[h] = row[idx] ? row[idx].trim() : null; });

  const lenderKey = mapLenderName(payload['NBFC Onboarding Name'] || payload['Choose NBFC']);
  if (!lenderKey) {
    noLenderMapped.push({ index: i, payload });
    continue;
  }

  const status = payload['NBFC Status'];
  if (status !== 'Disbursed') continue;

  const res = engine.evaluate(payload);
  const eligible = res.eligible_nbfcs.find(l => l.partner_id === lenderKey);
  const conditional = res.conditional_nbfcs.find(l => l.partner_id === lenderKey);
  const ineligible = res.ineligible_nbfcs.find(l => l.partner_id === lenderKey);

  if (eligible) {
    disbursedEligibles.push({ index: i, userId: payload.userId, lender: lenderKey, payload, res });
  } else if (conditional) {
    disbursedConditionals.push({ index: i, userId: payload.userId, lender: lenderKey, payload, conditional });
  } else if (ineligible) {
    disbursedHardRejections.push({ index: i, userId: payload.userId, lender: lenderKey, payload, ineligible });
    hardRejectionsByLender[lenderKey] = (hardRejectionsByLender[lenderKey] || 0) + 1;
    const rCode = ineligible.reason_code;
    hardRejectionsByReason[rCode] = (hardRejectionsByReason[rCode] || 0) + 1;
  }
}

console.log(`Disbursed Applications Summary:`);
console.log(`- Total Disbursed: ${disbursedEligibles.length + disbursedConditionals.length + disbursedHardRejections.length}`);
console.log(`- Algorithm ELIGIBLE for Disbursed Lender: ${disbursedEligibles.length}`);
console.log(`- Algorithm CONDITIONAL for Disbursed Lender: ${disbursedConditionals.length}`);
console.log(`- Algorithm HARD REJECTED (Contradictions!): ${disbursedHardRejections.length}`);

console.log('\nHard Rejections by Lender:');
console.log(hardRejectionsByLender);

console.log('\nHard Rejections by Reason Code:');
console.log(hardRejectionsByReason);

fs.writeFileSync('contradictions_raw.json', JSON.stringify(disbursedHardRejections, null, 2));
