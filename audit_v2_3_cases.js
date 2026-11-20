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

const records = [];
for (let i = 1; i < prodRows.length; i++) {
  const r = prodRows[i];
  const obj = { _row: i + 1 };
  prodHeaders.forEach((h, idx) => {
    obj[h] = r[idx] ? r[idx].trim() : '';
  });
  records.push(obj);
}

console.log('Total prod records:', records.length);

// 1. High Monthly Income Entries (e.g. > 2,00,000 or annual entered as monthly)
const highIncomeRows = [];
records.forEach(r => {
  const incStr = r['Co-Applicant Monthly Income'] || r['Co-Applicant Monthly Income Value'];
  const inc = parseFloat(incStr);
  if (!isNaN(inc) && inc >= 200000) {
    highIncomeRows.push({
      row: r._row,
      userId: r.userId,
      name: r['Academy PRE -Loan Journey Name'],
      income: inc,
      occupation: r['Co applicant Occupation'],
      lender: r['NBFC Onboarding Name'] || r['Choose NBFC'],
      status: r['NBFC Status']
    });
  }
});
console.log(`\nUnusually High Monthly Income (>= 200,000): ${highIncomeRows.length} rows`);
console.table(highIncomeRows.slice(0, 10));

// 2. Unusual Co-applicant Ages (< 21 or > 65 or > 70)
const unusualAgeRows = [];
records.forEach(r => {
  const ageStr = r['Co-Applicant Age'];
  const age = parseInt(ageStr, 10);
  if (!isNaN(age) && (age < 18 || age > 65)) {
    unusualAgeRows.push({
      row: r._row,
      userId: r.userId,
      name: r['Academy PRE -Loan Journey Name'],
      age: age,
      relation: r['Relation with the Co-Applicant'],
      lender: r['NBFC Onboarding Name'] || r['Choose NBFC'],
      status: r['NBFC Status']
    });
  }
});
console.log(`\nUnusual Ages (<18 or >65): ${unusualAgeRows.length} rows`);
console.table(unusualAgeRows);

// 3. Disbursed with No CIBIL Score
const disbursedNoCibil = records.filter(r => {
  const cibil = (r['CIBIL Score Range'] || '').trim().toLowerCase();
  const isNoCibil = cibil === '' || cibil.includes('no cibil') || cibil === 'ntc' || cibil === '0';
  return isNoCibil && r['NBFC Status'] === 'Disbursed';
});
console.log(`\nDisbursed with 'No CIBIL Score': ${disbursedNoCibil.length} rows`);
const ntcLenders = {};
disbursedNoCibil.forEach(r => {
  const l = r['NBFC Onboarding Name'] || r['Choose NBFC'];
  ntcLenders[l] = (ntcLenders[l] || 0) + 1;
});
console.log('NTC Disbursed by Lender:', ntcLenders);

// 4. Disbursed with CIBIL 300 - 649
const disbursedSubprime = records.filter(r => {
  const cibil = (r['CIBIL Score Range'] || '').trim();
  return cibil === '300 - 649' && r['NBFC Status'] === 'Disbursed';
});
console.log(`\nDisbursed with CIBIL '300 - 649': ${disbursedSubprime.length} rows`);
console.table(disbursedSubprime.map(r => ({
  row: r._row,
  userId: r.userId,
  name: r['Academy PRE -Loan Journey Name'],
  lender: r['NBFC Onboarding Name'] || r['Choose NBFC'],
  cibil: r['CIBIL Score Range'],
  income: r['Co-Applicant Monthly Income']
})));

// 5. UIDs with conflicting same-lender outcomes (e.g. both Disbursed and Rejected, or Dropped and Disbursed, for SAME lender)
const uidLenderMap = {};
records.forEach(r => {
  const uid = r.userId;
  const lender = (r['NBFC Onboarding Name'] || r['Choose NBFC']).trim().toUpperCase();
  const status = r['NBFC Status'];
  if (!uid || !lender || !status) return;

  const key = `${uid}:::${lender}`;
  if (!uidLenderMap[key]) uidLenderMap[key] = [];
  uidLenderMap[key].push({ row: r._row, status, name: r['Academy PRE -Loan Journey Name'], lender });
});

const conflictingSameLenderUIDs = [];
Object.entries(uidLenderMap).forEach(([key, attempts]) => {
  if (attempts.length > 1) {
    const statuses = new Set(attempts.map(a => a.status));
    // Conflicting if statuses differ (e.g. Dropped vs Disbursed, or Rejected vs Disbursed)
    if (statuses.size > 1) {
      conflictingSameLenderUIDs.push({
        key,
        userId: key.split(':::')[0],
        lender: key.split(':::')[1],
        attempts: attempts
      });
    }
  }
});
console.log(`\nUIDs with conflicting same-lender outcomes: ${conflictingSameLenderUIDs.length}`);
console.log('Sample conflicting UIDs:', conflictingSameLenderUIDs.slice(0, 5).map(c => ({
  userId: c.userId,
  lender: c.lender,
  attempts: c.attempts.map(a => `Row ${a.row}: ${a.status}`).join(' | ')
})));

// 6. Conditional according to algorithm but disbursed (509 records)
// Let's check which lenders accounted for the 509 disbursed records that were conditional or missing in earlier algorithm
const disbursedRecords = records.filter(r => r['NBFC Status'] === 'Disbursed');
console.log(`\nTotal Disbursed Records: ${disbursedRecords.length}`);
const disbursedByLender = {};
disbursedRecords.forEach(r => {
  const l = r['NBFC Onboarding Name'] || r['Choose NBFC'];
  disbursedByLender[l] = (disbursedByLender[l] || 0) + 1;
});
console.log('Disbursed by Lender in Production:', disbursedByLender);

fs.writeFileSync('audit_v2_3_findings.json', JSON.stringify({
  high_income_count: highIncomeRows.length,
  high_income_rows: highIncomeRows,
  unusual_age_count: unusualAgeRows.length,
  unusual_age_rows: unusualAgeRows,
  disbursed_no_cibil_count: disbursedNoCibil.length,
  disbursed_no_cibil_by_lender: ntcLenders,
  disbursed_subprime_count: disbursedSubprime.length,
  conflicting_same_lender_count: conflictingSameLenderUIDs.length,
  conflicting_same_lender_uids: conflictingSameLenderUIDs,
  disbursed_by_lender: disbursedByLender
}, null, 2));
