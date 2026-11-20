const fs = require('fs');

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

const prodRaw = fs.readFileSync('prod_data.csv', 'utf8');
const prodRows = parseCSV(prodRaw);
const prodHeaders = prodRows[0].map(h => h.trim());

const coAppRaw = fs.readFileSync('co_applicant_new_evaluated.csv', 'utf8');
const coAppRows = parseCSV(coAppRaw);
const coAppHeaders = coAppRows[0].map(h => h.trim());

console.log(`prodRows: ${prodRows.length - 1}, coAppRows: ${coAppRows.length - 1}`);

function mapLenderName(raw) {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  if (s.includes('GYANDHAN')) return 'gyandhan';
  if (s.includes('BAJAJ')) return 'bajaj';
  if (s.includes('AUXILO')) return 'auxilo';
  if (s.includes('FIBE')) return 'fibe';
  if (s.includes('NORTHERN')) return 'northern_arc';
  if (s.includes('TECHFINO')) return 'techfino';
  if (s.includes('FEEMONK')) return 'feemonk';
  if (s.includes('JODO')) return 'jodo_flex';
  return s.toLowerCase();
}

// Check 22 contradictions (Disbursed in production, but Ineligible in algorithm)
const contradictions22 = [];
// Check 57 reverse contradictions (Rejected in production, but Eligible in algorithm)
const reverse57 = [];
// Check lenders outside 6-NBFC model
const non6Lenders = {};
let disbursedMissingLender = 0;

for (let i = 1; i < prodRows.length; i++) {
  const pRow = prodRows[i];
  const cRow = coAppRows[i];

  const pObj = {};
  prodHeaders.forEach((h, idx) => pObj[h] = pRow[idx] ? pRow[idx].trim() : '');

  const cObj = {};
  coAppHeaders.forEach((h, idx) => cObj[h] = cRow[idx] ? cRow[idx].trim() : '');

  const onboardingLender = mapLenderName(pObj['NBFC Onboarding Name'] || pObj['Choose NBFC']);
  const status = pObj['NBFC Status'];

  // Check lenders outside 6-NBFC model
  const known6 = ['northern_arc', 'bajaj', 'auxilo', 'fibe', 'gyandhan', 'techfino'];
  if (onboardingLender && !known6.includes(onboardingLender)) {
    non6Lenders[onboardingLender] = (non6Lenders[onboardingLender] || 0) + 1;
    if (status === 'Disbursed') {
      disbursedMissingLender++;
    }
  }

  const eligibleStr = cObj['elibile'] || '';
  const rejectedStr = cObj['Rejected'] || '';

  // 1. Contradictions: Disbursed but Ineligible
  if (status === 'Disbursed' && onboardingLender && known6.includes(onboardingLender)) {
    const lenderPretty = {
      northern_arc: 'Northern Arc',
      bajaj: 'Bajaj Finserv',
      auxilo: 'Auxilo',
      fibe: 'Fibe',
      gyandhan: 'Gyandhan',
      techfino: 'Techfino'
    }[onboardingLender];

    if (rejectedStr.includes(lenderPretty)) {
      contradictions22.push({
        row: i + 1,
        userId: pObj.userId,
        name: pObj['Academy PRE -Loan Journey Name'],
        lender: onboardingLender,
        bank: cRow[14],
        cibil: pObj['CIBIL Score Range'],
        income: pObj['Co-Applicant Monthly Income'],
        status: status,
        rejectionExcerpt: rejectedStr.split('; ').find(s => s.includes(lenderPretty))
      });
    }
  }

  // 2. Reverse Contradictions: Rejected in production, but Eligible in algorithm
  if (status === 'Rejected' && onboardingLender && known6.includes(onboardingLender)) {
    const lenderPretty = {
      northern_arc: 'Northern Arc',
      bajaj: 'Bajaj Finserv',
      auxilo: 'Auxilo',
      fibe: 'Fibe',
      gyandhan: 'Gyandhan',
      techfino: 'Techfino'
    }[onboardingLender];

    if (eligibleStr.includes(lenderPretty)) {
      reverse57.push({
        row: i + 1,
        userId: pObj.userId,
        name: pObj['Academy PRE -Loan Journey Name'],
        lender: onboardingLender,
        bank: cRow[14],
        cibil: pObj['CIBIL Score Range'],
        income: pObj['Co-Applicant Monthly Income'],
        occupation: pObj['Co applicant Occupation'],
        state: pObj['State'],
        status: status
      });
    }
  }
}

console.log(`\n=== AUDIT RESULTS ===`);
console.log(`Disbursed Contradictions Count: ${contradictions22.length}`);
console.log(`Reverse Contradictions (Eligible in algo, Rejected in prod): ${reverse57.length}`);
console.log(`Records involving lenders outside 6-NBFC model:`, non6Lenders);
const totalNon6 = Object.values(non6Lenders).reduce((a, b) => a + b, 0);
console.log(`Total non-6 lender records: ${totalNon6}`);
console.log(`Disbursed cases with non-6 lenders (missing from both fields): ${disbursedMissingLender}`);

fs.writeFileSync('audit_22_cases.json', JSON.stringify(contradictions22, null, 2));
fs.writeFileSync('audit_57_cases.json', JSON.stringify(reverse57, null, 2));
