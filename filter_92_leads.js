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
const headers = rows[0];

const dateIdx = headers.indexOf('EMI_Setup_Date_Time');
console.log('EMI_Setup_Date_Time col index:', dateIdx);

// Filter rows where EMI_Setup_Date_Time >= 2026-10-31T00:00:00Z
const filtered = [headers];
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  const dateStr = r[dateIdx];
  if (dateStr) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime()) && d >= new Date('2026-10-31T00:00:00Z')) {
      filtered.push(r);
    }
  }
}

console.log('Filtered strictly timestamped last 5 days count:', filtered.length - 1);

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

const outCsv = filtered.map(row => row.map(escapeCSV).join(',')).join('\r\n');
fs.writeFileSync('last_5_days_strict_emi_setup_92_leads_no_pii.csv', outCsv, 'utf8');
console.log('Saved last_5_days_strict_emi_setup_92_leads_no_pii.csv successfully.');
