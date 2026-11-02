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

const raw = fs.readFileSync('nbfc_sheet_exported.csv', 'utf8');
const rows = parseCSV(raw);
const headers = rows[0];
const data = rows.slice(1);

function countFreq(colIndex) {
  const counts = {};
  data.forEach(r => {
    const val = (r[colIndex] || '(EMPTY)').trim();
    counts[val] = (counts[val] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

console.log('=== CIBIL SCORE RANGE (Col 3) ===');
console.table(countFreq(3));

console.log('\n=== RELATION (Col 4) ===');
console.table(countFreq(4));

console.log('\n=== TOP 20 OCCUPATIONS (Col 7) ===');
console.table(countFreq(7).slice(0, 20));

console.log('\n=== STATES (Col 8) ===');
console.table(countFreq(8));

console.log('\n=== BANKS (Col 10) ===');
console.table(countFreq(10));

// Age statistics
let validAges = [];
let missingAge = 0;
data.forEach(r => {
  const a = parseInt(r[9], 10);
  if (!isNaN(a)) validAges.push(a);
  else missingAge++;
});
validAges.sort((a, b) => a - b);
console.log('\n=== AGE STATS ===');
console.log({
  total: data.length,
  missing: missingAge,
  min: validAges[0],
  max: validAges[validAges.length - 1],
  median: validAges[Math.floor(validAges.length / 2)],
  under21: validAges.filter(a => a < 21).length,
  above58: validAges.filter(a => a > 58).length,
  above65: validAges.filter(a => a > 65).length
});

// Income statistics
let validIncomes = [];
let missingIncome = 0;
data.forEach(r => {
  const inc = parseFloat(r[6]);
  if (!isNaN(inc)) validIncomes.push(inc);
  else missingIncome++;
});
validIncomes.sort((a, b) => a - b);
console.log('\n=== INCOME STATS ===');
console.log({
  total: data.length,
  missing: missingIncome,
  min: validIncomes[0],
  max: validIncomes[validIncomes.length - 1],
  median: validIncomes[Math.floor(validIncomes.length / 2)],
  below15k: validIncomes.filter(i => i < 15000).length,
  between15k_18k: validIncomes.filter(i => i >= 15000 && i < 18000).length,
  between18k_25k: validIncomes.filter(i => i >= 18000 && i < 25000).length,
  above25k: validIncomes.filter(i => i >= 25000).length
});
