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

console.log(`Processing backtest on ${rows.length - 1} records...`);

let overallEligibleCount = 0;
let overallConditionalCount = 0;
let overallIneligibleCount = 0;

const lenderStats = {
  northern_arc: { eligible: 0, conditional: 0, ineligible: 0 },
  bajaj: { eligible: 0, conditional: 0, ineligible: 0 },
  auxilo: { eligible: 0, conditional: 0, ineligible: 0 },
  fibe: { eligible: 0, conditional: 0, ineligible: 0 },
  gyandhan: { eligible: 0, conditional: 0, ineligible: 0 },
  techfino: { eligible: 0, conditional: 0, ineligible: 0 }
};

const contradictionsBefore = JSON.parse(fs.readFileSync('contradictions_raw.json', 'utf8'));
const contradictionMap = new Map();
contradictionsBefore.forEach(c => {
  contradictionMap.set(`${c.userId}_${c.lender}`, c);
});

const resolvedContradictions = [];
const unresolvedContradictions = [];

// Prepare 16-column output
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
  'Ineligible NBFCs'
];

const outputRows = [outputHeaders.map(escapeCSVField).join(',')];

for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const payload = {};
  headers.forEach((h, idx) => { payload[h] = row[idx] ? row[idx].trim() : null; });

  const res = engine.evaluate(payload);

  if (res.eligible_nbfcs.length > 0) overallEligibleCount++;
  else if (res.conditional_nbfcs.length > 0) overallConditionalCount++;
  else overallIneligibleCount++;

  // Lender-level metrics
  const activeIds = ['northern_arc', 'bajaj', 'auxilo', 'fibe', 'gyandhan', 'techfino'];
  activeIds.forEach(id => {
    if (res.eligible_nbfcs.some(l => l.partner_id === id)) lenderStats[id].eligible++;
    else if (res.conditional_nbfcs.some(l => l.partner_id === id)) lenderStats[id].conditional++;
    else lenderStats[id].ineligible++;
  });

  // Check if this row was one of the 97 contradictions
  const appliedLenderKey = mapLenderName(payload['NBFC Onboarding Name'] || payload['Choose NBFC']);
  if (appliedLenderKey && payload['NBFC Status'] === 'Disbursed') {
    const key = `${payload.userId}_${appliedLenderKey}`;
    const oldContradiction = contradictionMap.get(key);
    if (oldContradiction) {
      const isEligible = res.eligible_nbfcs.some(l => l.partner_id === appliedLenderKey);
      const isConditional = res.conditional_nbfcs.some(l => l.partner_id === appliedLenderKey);
      const isIneligible = res.ineligible_nbfcs.some(l => l.partner_id === appliedLenderKey);

      const auditRecord = {
        userId: payload.userId,
        lender: appliedLenderKey,
        old_status: 'INELIGIBLE',
        old_reason_code: oldContradiction.ineligible.reason_code,
        old_detail: oldContradiction.ineligible.reason_detail,
        new_status: isEligible ? 'ELIGIBLE' : (isConditional ? 'CONDITIONAL' : 'INELIGIBLE'),
        new_reason_code: isEligible ? 'CRITERIA_SATISFIED' : (isConditional ? res.conditional_nbfcs.find(l => l.partner_id === appliedLenderKey).reason_code : res.ineligible_nbfcs.find(l => l.partner_id === appliedLenderKey).reason_code),
        new_detail: isEligible ? 'All mandatory underwriting criteria satisfied' : (isConditional ? res.conditional_nbfcs.find(l => l.partner_id === appliedLenderKey).reason_detail : res.ineligible_nbfcs.find(l => l.partner_id === appliedLenderKey).reason_detail),
        income: payload['Co-Applicant Monthly Income'],
        age: payload['Co-Applicant Age'],
        relation: payload['Relation with the Co-Applicant'],
        cibil: payload['CIBIL Score Range'],
        disbursement_confirmed: true
      };

      if (isEligible || isConditional) {
        resolvedContradictions.push(auditRecord);
      } else {
        unresolvedContradictions.push(auditRecord);
      }
    }
  }

  // Build CSV row with cleanly separated 3 columns
  const eligibleStr = res.eligible_nbfcs.map(e => e.partner_name).join('; ') || 'None';
  const conditionalStr = res.conditional_nbfcs.map(c => {
    const req = c.missing_requirements?.[0] || c.reason_code || 'Pending verification';
    return `${c.partner_name} (${req.replace(/,/g, '')})`;
  }).join('; ') || 'None';
  const ineligibleStr = res.ineligible_nbfcs.map(iEl => {
    const fail = iEl.failures?.[0] || iEl.reason_code || 'Criteria not met';
    return `${iEl.partner_name} (${fail.replace(/,/g, '')})`;
  }).join('; ') || 'None';

  // Extract original 13 fields (ignoring 'NBFC Status' if in prod_data)
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

  const fullRow = [...baseFields, eligibleStr, conditionalStr, ineligibleStr];
  outputRows.push(fullRow.map(escapeCSVField).join(','));
}

fs.writeFileSync('new_academy_report_v2_evaluated.csv', outputRows.join('\r\n'), 'utf8');
fs.writeFileSync('resolved_contradictions_audit.json', JSON.stringify(resolvedContradictions, null, 2), 'utf8');
fs.writeFileSync('unresolved_contradictions_audit.json', JSON.stringify(unresolvedContradictions, null, 2), 'utf8');

console.log('\n======================================================');
console.log('         ENHANCED ALGORITHM PRODUCTION BACKTEST       ');
console.log('======================================================');
console.log(`Total Records Evaluated: ${rows.length - 1}`);
console.log(`- Overall Eligible (>=1 NBFC): ${overallEligibleCount} (${((overallEligibleCount/(rows.length-1))*100).toFixed(1)}%)`);
console.log(`- Overall Conditional:          ${overallConditionalCount} (${((overallConditionalCount/(rows.length-1))*100).toFixed(1)}%)`);
console.log(`- Overall Ineligible:           ${overallIneligibleCount} (${((overallIneligibleCount/(rows.length-1))*100).toFixed(1)}%)`);

console.log('\n--- Lender-Wise Breakdown ---');
console.table(lenderStats);

console.log('\n--- 97 Historical Contradictions Reconciliation ---');
console.log(`Total Historical Disbursed Hard-Rejections: ${contradictionsBefore.length}`);
console.log(`- Contradictions Resolved with Evidence:    ${resolvedContradictions.length} / 97 (${((resolvedContradictions.length/97)*100).toFixed(1)}%)`);
console.log(`- Contradictions Requiring Bureau/Override: ${unresolvedContradictions.length} / 97 (${((unresolvedContradictions.length/97)*100).toFixed(1)}%)`);

// Detailed breakdown of resolved contradictions by category
const resolvedByCategory = {};
resolvedContradictions.forEach(r => {
  resolvedByCategory[r.old_reason_code] = (resolvedByCategory[r.old_reason_code] || 0) + 1;
});
console.log('\nResolved Contradictions by Category:');
console.table(resolvedByCategory);

console.log('\nUnresolved Cases Breakdown:');
unresolvedContradictions.forEach(u => {
  console.log(`- User ${u.userId} (${u.lender}): Old Reason=${u.old_reason_code}, CIBIL=${u.cibil}, Income=${u.income}`);
});
