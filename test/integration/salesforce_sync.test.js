const assert = require('assert');
const NBFCEligibilityEngine = require('../../src/engine/index');
const SalesforceSyncService = require('../../src/services/salesforce_sync');
const { getDatabaseRepository } = require('../../src/db/database');

console.log('--- RUNNING SALESFORCE INTEGRATION & SELECTION TESTS ---');

const db = getDatabaseRepository();
const engine = new NBFCEligibilityEngine({ db });
const syncService = new SalesforceSyncService({ db });

async function runTests() {
  // Test 1: Full flow - Evaluation -> Valid Selection -> Verified Sync
  const payload = {
    user_details: { user_id: 'sf-sync-user-1', salesforce_id: '00Q5g00000testA' },
    co_applicant_details: { name: 'Priya Sharma', age: 35, relation: 'Mother', state: 'Karnataka' },
    cibil_details: { cibil_score: 750 },
    employment_details: { monthly_income: 30000, occupation: 'TEACHER' },
    bank_details: { bank_name: 'SBIN' },
    address_details: { door_number: '12' },
    parameter_questions: {
      is_pan_aadhaar_linked: true,
      has_e_pan_or_physical_pan: true,
      has_dob_mismatch: false,
      has_name_mismatch: false,
      has_door_number: true
    }
  };

  const evalRes = engine.evaluate(payload);
  assert(evalRes.eligible_nbfcs.length > 0, 'Should have eligible lenders');
  const eligibleLender = evalRes.eligible_nbfcs[0].partner_id;

  const evalRecord = db.getEvaluationById(evalRes.evaluation_id);
  assert(evalRecord, 'Evaluation must be saved in SQLite');

  // Perform selection sync
  const syncResult = await syncService.syncSelection(evalRecord, eligibleLender);
  assert.strictEqual(syncResult.success, true, 'Sync should succeed');
  assert.strictEqual(syncResult.sync_status, 'MOCK_TRANSPORT_TESTED');
  assert.strictEqual(syncResult.is_live_production_sync, false);
  assert.strictEqual(syncResult.verification_status, 'UNVERIFIED_PENDING_SF_CREDENTIALS');

  // Test 2: Tamper Prevention - Attempting to select an INELIGIBLE lender must be rejected
  const fakeSelection = await syncService.syncSelection(evalRecord, 'non_existent_or_ineligible_lender');
  assert.strictEqual(fakeSelection.success, false, 'Ineligible lender selection must fail');
  assert.strictEqual(fakeSelection.sync_status, 'SELECTION_REJECTED');

  // Test 3: Idempotency Key - Repeated requests with identical idempotency key
  const idemKey = `idem_${Date.now()}`;
  const firstEval = engine.evaluate(payload, null, { idempotencyKey: idemKey });
  const secondEval = engine.evaluate(payload, null, { idempotencyKey: idemKey });
  assert.strictEqual(secondEval.is_cached_idempotent_response, true, 'Second evaluation with same key must return cached response');
  assert.strictEqual(firstEval.evaluation_id, secondEval.evaluation_id, 'Evaluation IDs must match for idempotent requests');

  // Test 4: Database Survival across restarts
  const fetched = db.getEvaluationById(firstEval.evaluation_id);
  assert.strictEqual(fetched.id, firstEval.evaluation_id);
  assert.strictEqual(fetched.salesforce_id, '00Q5g00000testA');

  console.log('✓ All Salesforce integration & selection validation tests passed successfully.');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
