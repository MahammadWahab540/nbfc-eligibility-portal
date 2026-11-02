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

const raw = fs.readFileSync('co_applicant_new.csv', 'utf8');
const rows = parseCSV(raw);
const headers = rows[0].map(h => h.trim());
console.log('Headers (length: ' + headers.length + '):');
headers.forEach((h, idx) => console.log(`  [Col ${idx}] (${String.fromCharCode(65 + idx)}): "${h}"`));

const dataRows = rows.slice(1);
console.log(`\nTotal Data Rows: ${dataRows.length}`);

const uniqueUIDs = new Set();
dataRows.forEach(r => uniqueUIDs.add(r[0]));
console.log(`Unique UIDs: ${uniqueUIDs.size}`);

const bankCounts = {};
dataRows.forEach(r => {
  const b = r[14] || '(Blank)';
  bankCounts[b] = (bankCounts[b] || 0) + 1;
});
console.log('\nTop 15 Bank Values:');
const sortedBanks = Object.entries(bankCounts).sort((a,b) => b[1] - a[1]);
console.log(sortedBanks.slice(0, 15));

console.log('\nSample Row 1:');
headers.forEach((h, idx) => console.log(`  ${h}: ${dataRows[0][idx]}`));
