const fs = require('fs');
const http = require('http');
const { execSync } = require('child_process');

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

function escapeCSVField(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function postEvaluate(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path: '/api/v1/eligibility/evaluate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      },
      res => {
        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`Failed to parse response: ${body.slice(0, 100)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('Reading exported co_applicant_new_fresh.csv...');
  const raw = fs.readFileSync('co_applicant_new_fresh.csv', 'utf8');
  const rows = parseCSV(raw);
  const headers = rows[0].map(h => h.trim());
  console.log(`Original columns (${headers.length}):`, headers);

  const baseHeaders = headers.slice(0, 15);
  const targetHeaders = [...baseHeaders, 'Elibility', 'reject', 'reason'];
  console.log('Target headers:', targetHeaders);

  const totalRecords = rows.length - 1;
  console.log(`Processing ${totalRecords} records against backend API...`);

  const evaluatedRows = [];
  evaluatedRows.push(targetHeaders.map(escapeCSVField).join(','));

  const batchSize = 50;
  let successCount = 0;
  let failCount = 0;

  for (let i = 1; i <= totalRecords; i += batchSize) {
    const batch = [];
    const endIndex = Math.min(i + batchSize, totalRecords + 1);

    for (let j = i; j < endIndex; j++) {
      const row = rows[j];
      const payload = {};
      baseHeaders.forEach((h, idx) => {
        payload[h] = row[idx] !== undefined ? row[idx].trim() : '';
      });
      batch.push({ rowIdx: j, row, payload });
    }

    const promises = batch.map(async item => {
      try {
        const res = await postEvaluate(item.payload);
        return { item, res, error: null };
      } catch (err) {
        return { item, res: null, error: err.message };
      }
    });

    const results = await Promise.all(promises);

    for (const r of results) {
      const { item, res, error } = r;
      const originalFields = baseHeaders.map((_, idx) => (item.row[idx] !== undefined ? item.row[idx] : ''));

      let elibilityVal = 'None';
      let rejectVal = 'None';
      let reasonVal = 'None';

      if (res) {
        successCount++;
        // 1. Elibility
        const eligibleList = [
          ...(res.eligible_nbfcs || []).map(e => e.partner_name),
          ...(res.conditional_nbfcs || []).map(c => `${c.partner_name} (Conditional)`)
        ];
        elibilityVal = eligibleList.length > 0 ? eligibleList.join('; ') : 'None';

        // 2. reject
        const rejectList = (res.ineligible_nbfcs || []).map(i => i.partner_name);
        rejectVal = rejectList.length > 0 ? rejectList.join('; ') : 'None';

        // 3. reason
        const reasonParts = [];
        (res.ineligible_nbfcs || []).forEach(i => {
          const detail = (i.all_failures && i.all_failures[0] && i.all_failures[0].failure) || i.reason_detail || i.reason_code || 'Criteria not met';
          reasonParts.push(`${i.partner_name}: ${detail.replace(/[\r\n]+/g, ' ')}`);
        });
        (res.conditional_nbfcs || []).forEach(c => {
          const cond = (c.missing_requirements && c.missing_requirements[0]) || (c.pending_verifications && c.pending_verifications[0]) || c.reason_detail || 'Pending verification';
          reasonParts.push(`${c.partner_name} (Conditional): ${cond.replace(/[\r\n]+/g, ' ')}`);
        });
        reasonVal = reasonParts.length > 0 ? reasonParts.join('; ') : 'None';
      } else {
        failCount++;
        reasonVal = `API Error: ${error}`;
      }

      const fullRow = [...originalFields, elibilityVal, rejectVal, reasonVal];
      evaluatedRows.push(fullRow.map(escapeCSVField).join(','));
    }

    if (endIndex % 500 === 0 || endIndex > totalRecords) {
      console.log(`Evaluated ${Math.min(endIndex - 1, totalRecords)} / ${totalRecords} records (Success: ${successCount}, Fail: ${failCount})...`);
    }
  }

  const outputCsv = evaluatedRows.join('\r\n');
  const outPath = 'co_applicant_new_updated.csv';
  fs.writeFileSync(outPath, outputCsv, 'utf8');
  console.log(`\nGenerated ${outPath} with ${evaluatedRows.length} lines.`);
  console.log(`Total Success: ${successCount}, Total Failures: ${failCount}`);

  // Push to Google Sheets tab "co-applicant -new"
  const sheetId = '1dSYa0AXRxSGNbUD3tENCp0jsY6BMfu8btwGy0V_VDFo';
  const tabName = 'co-applicant -new';
  console.log(`\nUpdating Google Sheet: tab "${tabName}" in spreadsheet ${sheetId}...`);

  const cmd = `gsheets mutate import-csv ${sheetId} ${outPath} --sheet "${tabName}"`;
  console.log(`Running: ${cmd}`);
  const out = execSync(cmd, { encoding: 'utf8' });
  console.log('Google Sheets Import Output:', out.trim());
  console.log('\n✓ Sheet successfully updated at Elibility, reject, reason!');
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
