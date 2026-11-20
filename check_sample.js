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

const rows = parseCSV(fs.readFileSync('co_applicant_new_updated.csv', 'utf8'));
const headers = rows[0];

let sampleCount = 0;
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (r[16] !== 'None' && sampleCount < 3) {
    sampleCount++;
    console.log(`\nSample ${sampleCount} (Row ${i + 1}):`);
    console.log(`  Name: ${r[1]} | CIBIL: ${r[4]} | Income: ${r[10]} | Bank: ${r[14]}`);
    console.log(`  Elibility: ${r[15]}`);
    console.log(`  reject:    ${r[16]}`);
    console.log(`  reason:    ${r[17]}`);
  }
}
