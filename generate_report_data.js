const fs = require('fs');

const results = JSON.parse(fs.readFileSync('batch_results.json', 'utf8'));

console.log(`Analyzing ${results.length} evaluated records...`);

const totalRecords = results.length;

let eligibleAnyCount = 0;
let conditionalAnyCount = 0;
let ineligibleAllCount = 0;

const eligibleCountHistogram = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

const partnerStats = {
  fibe: { eligible: 0, conditional: 0, ineligible: 0, reasons: {} },
  northern_arc: { eligible: 0, conditional: 0, ineligible: 0, reasons: {} },
  gyandhan: { eligible: 0, conditional: 0, ineligible: 0, reasons: {} },
  auxilo: { eligible: 0, conditional: 0, ineligible: 0, reasons: {} },
  techfino: { eligible: 0, conditional: 0, ineligible: 0, reasons: {} },
  bajaj: { eligible: 0, conditional: 0, ineligible: 0, reasons: {} }
};

const cibilStats = {};
const relationStats = {};
const bankStats = {};
const occupationStats = {};

results.forEach(item => {
  const resp = item.response;
  if (!resp) return;

  const elig = resp.eligible_nbfcs || [];
  const cond = resp.conditional_nbfcs || [];
  const inelig = resp.ineligible_nbfcs || [];

  eligibleCountHistogram[elig.length] = (eligibleCountHistogram[elig.length] || 0) + 1;

  if (elig.length > 0) eligibleAnyCount++;
  else if (cond.length > 0) conditionalAnyCount++;
  else ineligibleAllCount++;

  // Partner level
  elig.forEach(p => {
    if (partnerStats[p.partner_id]) partnerStats[p.partner_id].eligible++;
  });
  cond.forEach(p => {
    if (partnerStats[p.partner_id]) partnerStats[p.partner_id].conditional++;
  });
  inelig.forEach(p => {
    if (partnerStats[p.partner_id]) {
      partnerStats[p.partner_id].ineligible++;
      const reason = p.reason_detail || p.reason_code || 'Unknown';
      partnerStats[p.partner_id].reasons[reason] = (partnerStats[p.partner_id].reasons[reason] || 0) + 1;
    }
  });

  // By CIBIL
  const cibil = item.input.cibilRange || '(EMPTY)';
  if (!cibilStats[cibil]) cibilStats[cibil] = { total: 0, eligibleAny: 0, partners: {} };
  cibilStats[cibil].total++;
  if (elig.length > 0) cibilStats[cibil].eligibleAny++;
  elig.forEach(p => {
    cibilStats[cibil].partners[p.partner_id] = (cibilStats[cibil].partners[p.partner_id] || 0) + 1;
  });

  // By Relation
  const rel = item.input.relation || '(EMPTY)';
  if (!relationStats[rel]) relationStats[rel] = { total: 0, eligibleAny: 0, partners: {} };
  relationStats[rel].total++;
  if (elig.length > 0) relationStats[rel].eligibleAny++;
  elig.forEach(p => {
    relationStats[rel].partners[p.partner_id] = (relationStats[rel].partners[p.partner_id] || 0) + 1;
  });

  // By Bank
  const bank = item.input.bank || '(EMPTY)';
  if (!bankStats[bank]) bankStats[bank] = { total: 0, eligibleAny: 0, partners: {} };
  bankStats[bank].total++;
  if (elig.length > 0) bankStats[bank].eligibleAny++;
  elig.forEach(p => {
    bankStats[bank].partners[p.partner_id] = (bankStats[bank].partners[p.partner_id] || 0) + 1;
  });

  // By Occupation
  const occ = item.input.occupation || '(EMPTY)';
  if (!occupationStats[occ]) occupationStats[occ] = { total: 0, eligibleAny: 0, partners: {} };
  occupationStats[occ].total++;
  if (elig.length > 0) occupationStats[occ].eligibleAny++;
  elig.forEach(p => {
    occupationStats[occ].partners[p.partner_id] = (occupationStats[occ].partners[p.partner_id] || 0) + 1;
  });
});

console.log('\n======================================================');
console.log('             OVERALL ELIGIBILITY SUMMARY              ');
console.log('======================================================');
console.log(`Total records evaluated: ${totalRecords}`);
console.log(`Eligible for at least 1 NBFC: ${eligibleAnyCount} (${((eligibleAnyCount/totalRecords)*100).toFixed(1)}%)`);
console.log(`Conditional only: ${conditionalAnyCount} (${((conditionalAnyCount/totalRecords)*100).toFixed(1)}%)`);
console.log(`Completely Ineligible: ${ineligibleAllCount} (${((ineligibleAllCount/totalRecords)*100).toFixed(1)}%)`);

console.log('\n--- ELIGIBLE LENDERS COUNT PER APPLICANT ---');
Object.entries(eligibleCountHistogram).forEach(([k, v]) => {
  console.log(`  ${k} eligible NBFCs: ${v} applicants (${((v/totalRecords)*100).toFixed(1)}%)`);
});

console.log('\n======================================================');
console.log('             PARTNER PERFORMANCE METRICS              ');
console.log('======================================================');
Object.entries(partnerStats).forEach(([id, stats]) => {
  const eligPct = ((stats.eligible / totalRecords) * 100).toFixed(1);
  const condPct = ((stats.conditional / totalRecords) * 100).toFixed(1);
  const ineligPct = ((stats.ineligible / totalRecords) * 100).toFixed(1);
  console.log(`\n▶ Partner: ${id.toUpperCase()}`);
  console.log(`  - Eligible:     ${stats.eligible} (${eligPct}%)`);
  console.log(`  - Conditional:  ${stats.conditional} (${condPct}%)`);
  console.log(`  - Ineligible:   ${stats.ineligible} (${ineligPct}%)`);

  console.log(`  - Top Rejection Reasons:`);
  const sortedReasons = Object.entries(stats.reasons).sort((a, b) => b[1] - a[1]);
  sortedReasons.slice(0, 5).forEach(([r, count]) => {
    console.log(`      * [${count} cases | ${((count/totalRecords)*100).toFixed(1)}%] ${r}`);
  });
});

console.log('\n======================================================');
console.log('             CIBIL BRACKET VS ELIGIBILITY             ');
console.log('======================================================');
Object.entries(cibilStats).forEach(([bracket, s]) => {
  console.log(`\nBracket: "${bracket}" (Total: ${s.total})`);
  console.log(`  Eligible for at least 1 NBFC: ${s.eligibleAny} (${((s.eligibleAny/s.total)*100).toFixed(1)}%)`);
  console.log(`  Partner breakdown:`, s.partners);
});

console.log('\n======================================================');
console.log('             RELATION VS ELIGIBILITY                  ');
console.log('======================================================');
Object.entries(relationStats).forEach(([rel, s]) => {
  console.log(`\nRelation: "${rel}" (Total: ${s.total})`);
  console.log(`  Eligible for at least 1 NBFC: ${s.eligibleAny} (${((s.eligibleAny/s.total)*100).toFixed(1)}%)`);
  console.log(`  Partner breakdown:`, s.partners);
});

console.log('\n======================================================');
console.log('             TOP 10 OCCUPATIONS VS ELIGIBILITY        ');
console.log('======================================================');
const sortedOcc = Object.entries(occupationStats).sort((a, b) => b[1].total - a[1].total).slice(0, 10);
sortedOcc.forEach(([occ, s]) => {
  console.log(`\nOccupation: "${occ}" (Total: ${s.total})`);
  console.log(`  Eligible for at least 1 NBFC: ${s.eligibleAny} (${((s.eligibleAny/s.total)*100).toFixed(1)}%)`);
  console.log(`  Partner breakdown:`, s.partners);
});
