const fs = require('fs');
const cases57 = JSON.parse(fs.readFileSync('audit_57_cases.json', 'utf8'));

console.log(`--- 57 REVERSE CONTRADICTIONS (Algo Eligible, Prod Rejected) ---`);
const byLender = {};
const byCibil = {};
const byBank = {};
const byOcc = {};

cases57.forEach(c => {
  byLender[c.lender] = (byLender[c.lender] || 0) + 1;
  byCibil[c.cibil] = (byCibil[c.cibil] || 0) + 1;
  byBank[c.bank || '(Blank)'] = (byBank[c.bank || '(Blank)'] || 0) + 1;
  byOcc[c.occupation || '(Blank)'] = (byOcc[c.occupation || '(Blank)'] || 0) + 1;
});

console.log('By Lender:', byLender);
console.log('By CIBIL:', byCibil);
console.log('Top Banks:', Object.entries(byBank).sort((a,b)=>b[1]-a[1]).slice(0, 10));
console.log('Top Occupations:', Object.entries(byOcc).sort((a,b)=>b[1]-a[1]).slice(0, 10));

console.log('\nSample 10 Cases:');
console.log(cases57.slice(0, 10));
