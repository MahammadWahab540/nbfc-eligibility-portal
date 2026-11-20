const fs = require('fs');
const NBFCEligibilityEngine = require('./src/engine/index');

const engine = new NBFCEligibilityEngine();
const data = require('./drill_down_4_leads.json');

const targetUserIds = [
  '788da375-f0b8-423c-b95d-e4ddc29e7280',
  '07d0733f-6886-44b0-9bf8-e1a13aae9841',
  'cdd4b482-586f-4e3e-90ae-9b0173c14294',
  'd6e9115b-f1f1-4516-919e-80f9243d60c2'
];

targetUserIds.forEach((uid, index) => {
  console.log(`\n======================================================================`);
  console.log(`LEAD #${index + 1}: User ID: ${uid}`);
  console.log(`======================================================================`);

  const academies = data.academyRecords.filter(a => a.userId__c === uid);
  console.log(`Academy Records Count: ${academies.length}`);

  academies.forEach((a, aIdx) => {
    console.log(`\n--- Academy Record [${aIdx + 1}/${academies.length}]: ${a.Id} (${a.Name}) ---`);
    console.log(`Emi Setup Date/Time   : ${a.Emi_Setup_Date_Time__c}`);
    console.log(`Onboarding Status     : ${a.Onboarding_Status__c}`);
    console.log(`KYC Status            : ${a.KYC_Submission_Status_PRE__c} (${a.KYC_Submission_Date_and_Time_PRE__c})`);
    console.log(`Choose NBFC           : ${a.Choose_NBFC_PRE__c}`);
    console.log(`Disbursed NBFC        : ${a.Disbursed_NBFC_Name__c}`);
    console.log(`Active NBFC Records   : ${a.Active_NBFC_Records__c}`);
    console.log(`Previous NBFC         : ${a.Previous_NBFC__c}`);
    console.log(`State                 : ${a.State__c || a.Co_Applicant_State_PRE__c}`);
    console.log(`Eligible NBFCs (SF)   : ${a.Eligible_NBFCs_PRE__c}`);
    console.log(`Call Remarks          : ${a.NBFC_Call_Remarks_PRE__c || 'None'}`);
    console.log(`Bank Remarks          : ${a.Remarks_For_Bank_Dependency_in_NBFC_PRE__c || 'None'}`);

    const coApps = data.coAppRecords.filter(c => c.Academy_Onboarding_PRE__c === a.Id);
    console.log(`Linked Co-Applicant Records: ${coApps.length}`);

    coApps.forEach((co, cIdx) => {
      console.log(`\n  >> Co-Applicant [${cIdx + 1}]: ${co.Id} (${co.Name})`);
      console.log(`     Relation           : ${co.RELATION_WITH_THE_COAPPLICANT_PRE__c}`);
      console.log(`     Age                : ${co.Co_Applicant_age_pre__c}`);
      console.log(`     Monthly Income     : INR ${co.COAPPLICANT_MONTHLY_INCOME_PRE__c}`);
      console.log(`     Employment Type    : ${co.Co_Applicant_Employment_Type_PRE__c}`);
      console.log(`     Occupation         : ${co.Co_Applicant_Occupation_PRE__c}`);
      console.log(`     CIBIL Range        : ${co.CIBIL_SCORE_RANGE_PRE__c}`);
      console.log(`     Bank Name          : ${co.Co_Applicant_s_Bank_Name_PRE__c}`);
      console.log(`     State              : ${co.Co_Applicant_state_pre__c || a.State__c}`);
      console.log(`     PAN-Aadhaar Linked : ${co.PAN_and_Adhaar_is_to_be_linked__c}`);
      console.log(`     E-PAN/Physical PAN : ${co.E_Pan_Physical_PAN_Availability__c}`);
      console.log(`     DOB Mismatch       : ${co.DOB_mismatch_in_Adhaar_and_PAN__c}`);
      console.log(`     Name Mismatch      : ${co.NAME_mismatch_in_Adhaar_and_PAN__c}`);
      console.log(`     CoApp Choose NBFC  : ${co.CHOOSE_NBFC_PRE__c}`);
      console.log(`     Reasons For Jodo   : ${co.REASONS_FOR_SELECTING_JODO_PRE__c || 'None'}`);

      // Evaluate against current engine
      const resolvedState = a.State__c || co.Co_Applicant_state_pre__c || a.Co_Applicant_State_PRE__c || null;
      const payload = {
        Id: co.Id,
        salesforce_id: co.Id,
        userId: uid,
        Name: a.Name,
        CIBIL_SCORE_RANGE_PRE__c: co.CIBIL_SCORE_RANGE_PRE__c,
        COAPPLICANT_MONTHLY_INCOME_PRE__c: co.COAPPLICANT_MONTHLY_INCOME_PRE__c,
        Co_Applicant_s_Bank_Name_PRE__c: co.Co_Applicant_s_Bank_Name_PRE__c,
        RELATION_WITH_THE_COAPPLICANT_PRE__c: co.RELATION_WITH_THE_COAPPLICANT_PRE__c,
        Co_Applicant_Occupation_PRE__c: co.Co_Applicant_Occupation_PRE__c,
        Co_Applicant_Employment_Type_PRE__c: co.Co_Applicant_Employment_Type_PRE__c,
        Co_Applicant_age_pre__c: co.Co_Applicant_age_pre__c,
        State: resolvedState,
        Co_Applicant_state_pre__c: resolvedState,
        parameter_questions: {
          has_name_mismatch: co.NAME_mismatch_in_Adhaar_and_PAN__c === 'Yes',
          has_dob_mismatch: co.DOB_mismatch_in_Adhaar_and_PAN__c === 'Yes',
          is_pan_aadhaar_linked: co.PAN_and_Adhaar_is_to_be_linked__c !== 'No',
          has_e_pan_or_physical_pan: co.E_Pan_Physical_PAN_Availability__c !== 'No',
          has_door_number: true
        }
      };

      const res = engine.evaluate(payload);
      console.log(`\n     --- ENGINE EVALUATION RESULTS ---`);
      console.log(`     Eligible NBFCs (${res.eligible_nbfcs.length})    : ${res.eligible_nbfcs.map(e => `${e.partner_name} (Rank #${e.rank}, Prio #${e.priority})`).join(', ') || 'None'}`);
      console.log(`     Conditional NBFCs (${res.conditional_nbfcs.length}) : ${res.conditional_nbfcs.map(c => `${c.partner_name} [${c.missing_requirements?.[0] || 'Verification pending'}]`).join(', ') || 'None'}`);
      console.log(`     Ineligible NBFCs (${res.ineligible_nbfcs.length})  : ${res.ineligible_nbfcs.map(i => `${i.partner_name} [${i.failures?.[0]?.detail || 'Criteria not met'}]`).join(', ') || 'None'}`);
      console.log(`     Recommendation Reason: ${res.recommendation?.reason || 'None'}`);
    });
  });
});
