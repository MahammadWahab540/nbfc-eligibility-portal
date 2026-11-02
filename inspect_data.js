const fs = require('fs');

// Simple CSV parser that handles quotes properly
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
        i++; // skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
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

const csvData = fs.readFileSync('nbfc_sheet_exported.csv', 'utf8');
const rows = parseCSV(csvData);

const headers = rows[0];
console.log('Total rows (including header):', rows.length);
console.log('Columns (' + headers.length + '):');
headers.forEach((h, idx) => console.log(`  [${idx}] ${h}`));

const dataRows = rows.slice(1);

// Analyze unique values and stats
const stats = {};
headers.forEach((h, idx) => {
  stats[h] = {
    emptyCount: 0,
    uniqueValues: new Set()
  };
});

dataRows.forEach(row => {
  headers.forEach((h, idx) => {
    const val = (row[idx] || '').trim();
    if (!val) {
      stats[h].emptyCount++;
    } else {
      stats[h].uniqueValues.add(val);
    }
  });
});

console.log('\n--- COLUMN DATA SUMMARY ---');
headers.forEach(h => {
  const s = stats[h];
  const uniqueArr = Array.from(s.uniqueValues);
  console.log(`\nColumn: ${h}`);
  console.log(`  Empty: ${s.emptyCount} / ${dataRows.length} (${((s.emptyCount/dataRows.length)*100).toFixed(1)}%)`);
  console.log(`  Distinct count: ${uniqueArr.length}`);
  if (uniqueArr.length <= 15) {
    console.log(`  Values:`, uniqueArr);
  } else {
    console.log(`  Sample values (first 10):`, uniqueArr.slice(0, 10));
  }
});
