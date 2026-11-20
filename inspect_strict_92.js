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

const raw = fs.readFileSync('last_5_days_strict_emi_setup_92_leads_no_pii.csv', 'utf8');
const rows = parseCSV(raw);
const headers = rows[0];

const kycIdx = headers.indexOf('Current_KYC_Status');
const appNbfcIdx = headers.indexOf('NBFC_In_Application');
const disbNbfcIdx = headers.indexOf('Disbursed_NBFC');
const cibilIdx = headers.indexOf('CIBIL_Score_Range');
const verdictIdx = headers.indexOf('Local_Algo_Verdict');
const eligibleIdx = headers.indexOf('Local_Algo_Eligible_NBFCs');
const topRecIdx = headers.indexOf('Top_Suggested_NBFC');
const reasonIdx = headers.indexOf('Local_Algo_Reason');

const stats = {
  total: rows.length - 1,
  kyc: {},
  appNbfc: {},
  disbNbfc: {},
  cibil: {},
  verdict: {}
};

for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  stats.kyc[r[kycIdx]] = (stats.kyc[r[kycIdx]] || 0) + 1;
  stats.appNbfc[r[appNbfcIdx]] = (stats.appNbfc[r[appNbfcIdx]] || 0) + 1;
  stats.disbNbfc[r[disbNbfcIdx]] = (stats.disbNbfc[r[disbNbfcIdx]] || 0) + 1;
  stats.cibil[r[cibilIdx]] = (stats.cibil[r[cibilIdx]] || 0) + 1;
  stats.verdict[r[verdictIdx]] = (stats.verdict[r[verdictIdx]] || 0) + 1;
}

console.log('Stats of 93 strictly timestamped EMI Setup leads in last 5 days:');
console.log(JSON.stringify(stats, null, 2));

console.log('\nTop 8 Sample records:');
for (let i = 1; i <= Math.min(8, rows.length - 1); i++) {
  const r = rows[i];
  console.log(`[#${i}] User ID: ${r[0]}`);
  console.log(`   EMI Setup Date: ${r[4]} | Current KYC: ${r[kycIdx]}`);
  console.log(`   NBFC in Application: ${r[appNbfcIdx]} | Disbursed NBFC: ${r[disbNbfcIdx]}`);
  console.log(`   CIBIL: ${r[cibilIdx]} | Income: INR ${r[10]} | Relation: ${r[11]} | Occ: ${r[12]} | Bank: ${r[14]}`);
  console.log(`   Current SF Value: ${r[16]}`);
  console.log(`   Local Algo Verdict: ${r[verdictIdx]}`);
  console.log(`   Local Algo Eligible: ${r[eligibleIdx]}`);
  console.log(`   Top Suggested NBFC: ${r[topRecIdx]}`);
  console.log(`   Reason: ${r[reasonIdx]}`);
  console.log('----------------------------------------------------');
}
