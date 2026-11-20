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
const rows = parseCSV(prodRaw);
const headers = rows[0].map(h => h.trim());

const feemonkRows = [];
const jodoRows = [];

for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  const obj = {};
  headers.forEach((h, idx) => obj[h] = r[idx] ? r[idx].trim() : '');
  const lender = (obj['NBFC Onboarding Name'] || obj['Choose NBFC'] || '').toUpperCase();
  if (lender.includes('FEEMONK')) feemonkRows.push(obj);
  if (lender.includes('JODO')) jodoRows.push(obj);
}

console.log(`Total Feemonk rows: ${feemonkRows.length}`);
console.log(`Total Jodo rows: ${jodoRows.length}`);

// Profile Feemonk disbursed
const feemonkDisbursed = feemonkRows.filter(r => r['NBFC Status'] === 'Disbursed');
console.log(`Feemonk Disbursed: ${feemonkDisbursed.length}`);

const feemonkCibil = {};
const feemonkIncome = [];
const feemonkRel = {};
feemonkDisbursed.forEach(r => {
  feemonkCibil[r['CIBIL Score Range'] || '(Blank)'] = (feemonkCibil[r['CIBIL Score Range'] || '(Blank)'] || 0) + 1;
  feemonkRel[r['Relation with the Co-Applicant'] || '(Blank)'] = (feemonkRel[r['Relation with the Co-Applicant'] || '(Blank)'] || 0) + 1;
  const inc = parseFloat(r['Co-Applicant Monthly Income']);
  if (!isNaN(inc)) feemonkIncome.push(inc);
});
console.log('Feemonk Disbursed CIBIL:', feemonkCibil);
console.log('Feemonk Disbursed Relations:', feemonkRel);
console.log('Feemonk Min Income:', Math.min(...feemonkIncome), 'Median Income:', feemonkIncome.sort((a,b)=>a-b)[Math.floor(feemonkIncome.length/2)]);

// Profile Jodo disbursed
const jodoDisbursed = jodoRows.filter(r => r['NBFC Status'] === 'Disbursed');
console.log(`\nJodo Disbursed: ${jodoDisbursed.length}`);
const jodoCibil = {};
const jodoIncome = [];
const jodoRel = {};
jodoDisbursed.forEach(r => {
  jodoCibil[r['CIBIL Score Range'] || '(Blank)'] = (jodoCibil[r['CIBIL Score Range'] || '(Blank)'] || 0) + 1;
  jodoRel[r['Relation with the Co-Applicant'] || '(Blank)'] = (jodoRel[r['Relation with the Co-Applicant'] || '(Blank)'] || 0) + 1;
  const inc = parseFloat(r['Co-Applicant Monthly Income']);
  if (!isNaN(inc)) jodoIncome.push(inc);
});
console.log('Jodo Disbursed CIBIL:', jodoCibil);
console.log('Jodo Disbursed Relations:', jodoRel);
console.log('Jodo Min Income:', Math.min(...jodoIncome), 'Median Income:', jodoIncome.sort((a,b)=>a-b)[Math.floor(jodoIncome.length/2)]);
