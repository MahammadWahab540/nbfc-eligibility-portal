const leads = require('./last_5_days_emi_leads_complete.json');

const gyandhanReasons = {};
const techfinoReasons = {};
const bajajReasons = {};

leads.forEach(l => {
  const g = [...(l.res.conditional_nbfcs || []), ...(l.res.ineligible_nbfcs || [])].find(x => x.partner_id === 'gyandhan');
  if (g) {
    const key = (g.missing_requirements || []).concat(g.failures || []).join(' | ');
    gyandhanReasons[key] = (gyandhanReasons[key] || 0) + 1;
  }

  const t = [...(l.res.conditional_nbfcs || []), ...(l.res.ineligible_nbfcs || [])].find(x => x.partner_id === 'techfino');
  if (t) {
    const key = (t.missing_requirements || []).concat(t.failures || []).join(' | ');
    techfinoReasons[key] = (techfinoReasons[key] || 0) + 1;
  }

  const b = [...(l.res.conditional_nbfcs || []), ...(l.res.ineligible_nbfcs || [])].find(x => x.partner_id === 'bajaj');
  if (b) {
    const key = (b.missing_requirements || []).concat(b.failures || []).join(' | ');
    bajajReasons[key] = (bajajReasons[key] || 0) + 1;
  }
});

console.log('=== GYANDHAN REASONS ===');
console.log(JSON.stringify(gyandhanReasons, null, 2));

console.log('\n=== TECHFINO REASONS ===');
console.log(JSON.stringify(techfinoReasons, null, 2));

console.log('\n=== BAJAJ REASONS ===');
console.log(JSON.stringify(bajajReasons, null, 2));
