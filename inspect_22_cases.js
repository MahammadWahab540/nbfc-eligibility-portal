const fs = require('fs');
const cases22 = JSON.parse(fs.readFileSync('audit_22_cases.json', 'utf8'));

console.log('--- 22 FALSE-REJECTION CONTRADICTIONS ---');
const byReason = {};
cases22.forEach((c, idx) => {
  const k = c.lender + ': ' + (c.rejectionExcerpt || 'Other');
  byReason[k] = (byReason[k] || 0) + 1;
  console.log(`[#${idx + 1}] Row ${c.row} (UID ${c.userId.slice(0, 8)}...): Lender=${c.lender}, Bank=${c.bank}, CIBIL=${c.cibil}, Income=${c.income}`);
  console.log(`     Rejection: ${c.rejectionExcerpt}`);
});

console.log('\nSummary by Reason:');
console.log(byReason);
