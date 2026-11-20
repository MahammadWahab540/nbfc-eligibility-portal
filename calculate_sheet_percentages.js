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

const raw = fs.readFileSync('last_5_days_emi_setup_evaluated_no_pii.csv', 'utf8');
const rows = parseCSV(raw);
const headers = rows[0].map(h => h.trim());

const idxDisbursed = headers.indexOf('Disbursed_NBFC');
const idxEligible = headers.indexOf('Current_SF_Eligible_NBFCs');
const idxConditional = headers.indexOf('Local_Algo_Conditional_NBFCs');

let totalRows = rows.length - 1;
let recordedDisbursed = 0;
let notDisbursed = 0;

let directMatches = 0;
let conditionalMatches = 0;
let totalMatches = 0;
let mismatches = 0;

const lenderStats = {};

for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  const disb = (r[idxDisbursed] || '').trim();
  const eligibleStr = (r[idxEligible] || '').trim();
  const condStr = (r[idxConditional] || '').trim();

  if (!disb || disb.toLowerCase() === 'not disbursed' || disb.toLowerCase() === 'null') {
    notDisbursed++;
    continue;
  }

  recordedDisbursed++;

  if (!lenderStats[disb]) {
    lenderStats[disb] = { count: 0, direct: 0, conditional: 0, totalMatched: 0, unmatched: 0 };
  }
  lenderStats[disb].count++;

  const dUpper = disb.toUpperCase();
  let prefix = dUpper.split('_')[0];
  if (dUpper.includes('BAJAJ')) prefix = 'BAJAJ';
  if (dUpper.includes('NORTHERN')) prefix = 'NORTHERN';

  const elUpper = eligibleStr.toUpperCase();
  const condUpper = condStr.toUpperCase();

  const isDirect = elUpper.includes(prefix);
  const isCond = condUpper.includes(prefix);

  if (isDirect) {
    directMatches++;
    totalMatches++;
    lenderStats[disb].direct++;
    lenderStats[disb].totalMatched++;
  } else if (isCond) {
    conditionalMatches++;
    totalMatches++;
    lenderStats[disb].conditional++;
    lenderStats[disb].totalMatched++;
  } else {
    mismatches++;
    lenderStats[disb].unmatched++;
  }
}

console.log('=== EXACT CALCULATIONS FROM THE SHEET ===');
console.log('Total Leads (Rows):', totalRows);
console.log('Leads with Disbursed NBFC Name:', recordedDisbursed);
console.log('Not Disbursed / Drop-offs:', notDisbursed);
console.log('');
console.log('1. Direct Match (Disbursed NBFC in Eligible NBFCs PRE):');
console.log('   Count:', directMatches);
console.log('   Percentage of Disbursed Leads:', ((directMatches / recordedDisbursed) * 100).toFixed(1) + '% (' + directMatches + '/' + recordedDisbursed + ')');
console.log('   Percentage of Total Leads:', ((directMatches / totalRows) * 100).toFixed(1) + '% (' + directMatches + '/' + totalRows + ')');
console.log('');
console.log('2. Matches Including Conditional Eligibility:');
console.log('   Count:', totalMatches);
console.log('   Percentage of Disbursed Leads:', ((totalMatches / recordedDisbursed) * 100).toFixed(1) + '% (' + totalMatches + '/' + recordedDisbursed + ')');
console.log('   Percentage of Total Leads:', ((totalMatches / totalRows) * 100).toFixed(1) + '% (' + totalMatches + '/' + totalRows + ')');
console.log('');
console.log('3. Breakdown by Disbursed NBFC:');
console.log(JSON.stringify(lenderStats, null, 2));

const feemonkCount = lenderStats['FEEMONK'] ? lenderStats['FEEMONK'].count : 0;
const feemonkDirect = lenderStats['FEEMONK'] ? lenderStats['FEEMONK'].direct : 0;
const feemonkTotal = lenderStats['FEEMONK'] ? lenderStats['FEEMONK'].totalMatched : 0;

const exFeemonkDisbursed = recordedDisbursed - feemonkCount;
const exFeemonkDirect = directMatches - feemonkDirect;
const exFeemonkTotal = totalMatches - feemonkTotal;

console.log('');
console.log('4. Excluding Feemonk (Core Lenders Only):');
console.log('   Core Disbursed:', exFeemonkDisbursed);
console.log('   Direct Match Rate:', ((exFeemonkDirect / exFeemonkDisbursed) * 100).toFixed(1) + '% (' + exFeemonkDirect + '/' + exFeemonkDisbursed + ')');
console.log('   Total Match Rate (Direct + Cond):', ((exFeemonkTotal / exFeemonkDisbursed) * 100).toFixed(1) + '% (' + exFeemonkTotal + '/' + exFeemonkDisbursed + ')');
