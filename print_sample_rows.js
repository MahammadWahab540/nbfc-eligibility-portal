const data = require('./last_5_days_emi_leads_complete.json');

const sample = data.slice(0, 5);
sample.forEach((d, idx) => {
  const a = d.academy;
  const co = d.coApp || {};
  const res = d.res;
  console.log(`[Lead #${idx+1}] User ID: ${a.userId__c}`);
  console.log(`  EMI Setup: ${a.Emi_Setup_Date_Time__c}`);
  console.log(`  Current KYC: ${a.KYC_Submission_Status_PRE__c || 'N/A'} (${a.KYC_Submission_Date_and_Time_PRE__c || 'N/A'})`);
  console.log(`  NBFC in Application: ${a.Choose_NBFC_PRE__c || 'None'} | Disbursed NBFC: ${a.Disbursed_NBFC_Name__c || 'Pending'}`);
  console.log(`  Employment Type: ${d.empType} | Occupation: ${co.Co_Applicant_Occupation_PRE__c || 'N/A'}`);
  console.log(`  CIBIL: ${co.CIBIL_SCORE_RANGE_PRE__c || 'N/A'} | Income: INR ${co.COAPPLICANT_MONTHLY_INCOME_PRE__c || 0} | Bank: ${co.Co_Applicant_s_Bank_Name_PRE__c || 'None'}`);
  console.log(`  Current SF Value: ${a.Eligible_NBFCs_PRE__c || co.Eligible_NBFCs_PRE__c || 'None'}`);
  console.log(`  Local Algo Verdict: ${d.verdict}`);
  console.log(`  Local Algo Eligible: ${res.eligible_nbfcs.map(e => e.partner_name).join(', ') || 'None'}`);
  console.log(`  Local Algo Conditional: ${res.conditional_nbfcs.map(c => c.partner_name).join(', ') || 'None'}`);
  console.log(`  Local Algo Ineligible: ${res.ineligible_nbfcs.map(i => i.partner_name).join(', ') || 'None'}`);
  console.log('------------------------------------------------------------');
});
