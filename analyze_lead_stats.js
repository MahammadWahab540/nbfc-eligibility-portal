const leads = require('./last_5_days_emi_leads_complete.json');

let cibil700Plus = 0;
let income25kPlus = 0;
let income15kPlus = 0;
let both700And25k = 0;
let both700And15k = 0;

leads.forEach(l => {
  const co = l.coApp;
  const cibil = co.CIBIL_SCORE_RANGE_PRE__c;
  const income = co.COAPPLICANT_MONTHLY_INCOME_PRE__c || 0;

  const is700 = cibil === '700 - 900' || (cibil && parseInt(cibil) >= 700);
  const is15k = income >= 15000;
  const is25k = income >= 25000;

  if (is700) cibil700Plus++;
  if (is15k) income15kPlus++;
  if (is25k) income25kPlus++;
  if (is700 && is25k) both700And25k++;
  if (is700 && is15k) both700And15k++;
});

console.log('Total leads:', leads.length);
console.log('CIBIL 700 - 900:', cibil700Plus);
console.log('Income >= 25,000:', income25kPlus);
console.log('Income >= 15,000:', income15kPlus);
console.log('CIBIL 700+ AND Income >= 25,000:', both700And25k);
console.log('CIBIL 700+ AND Income >= 15,000:', both700And15k);
