/**
 * NBFC Production Outcome Reconciliation Unit Tests
 */

const assert = require('assert');
const { NBFCReconciliationService, normalizeLenderCode } = require('../../src/services/reconciliation');

console.log('--- RUNNING RECONCILIATION SERVICE UNIT TESTS ---');

// Test 1: Lender code normalizer
assert.strictEqual(normalizeLenderCode('GYANDHAN'), 'gyandhan');
assert.strictEqual(normalizeLenderCode('BAJAJ_FINANCE_LIMITED'), 'bajaj');
assert.strictEqual(normalizeLenderCode('Northern Arc Capital'), 'northern_arc');
assert.strictEqual(normalizeLenderCode('FIBE / EarlySalary'), 'fibe');
assert.strictEqual(normalizeLenderCode('TECHFINO'), 'techfino');
assert.strictEqual(normalizeLenderCode('AUXILO FINSERVE'), 'auxilo');
assert.strictEqual(normalizeLenderCode('FEEMONK'), 'feemonk');
assert.strictEqual(normalizeLenderCode('JODO_FLEX'), 'jodo_flex');
console.log('✓ Test 1: normalizeLenderCode handles variants and external partners');

// Test 2: In-memory reconciliation with confirmed match
const mockReconciler = new NBFCReconciliationService();
const sampleRecords = [
  {
    userId: 'user_001',
    Name: 'Test Eligible Applicant',
    'NBFC Onboarding Name': 'NORTHERN_ARC',
    'NBFC Status': 'Disbursed',
    'CIBIL Score Range': '700 - 900',
    'Co-Applicant Monthly Income': '35000',
    'Co-Applicant Age': '40',
    'Relation with the Co-Applicant': 'Father',
    State: 'Karnataka',
    "Co-Applicant's Bank Name": 'HDFC'
  },
  {
    userId: 'user_002',
    Name: 'Test Disbursed Contradiction (Subprime)',
    'NBFC Onboarding Name': 'NORTHERN_ARC',
    'NBFC Status': 'Disbursed',
    'CIBIL Score Range': '300 - 649',
    'Co-Applicant Monthly Income': '35000',
    'Co-Applicant Age': '40',
    'Relation with the Co-Applicant': 'Father',
    State: 'Karnataka',
    "Co-Applicant's Bank Name": 'HDFC'
  },
  {
    userId: 'user_003',
    Name: 'Test External Partner Feemonk',
    'NBFC Onboarding Name': 'FEEMONK',
    'NBFC Status': 'Disbursed',
    'CIBIL Score Range': '700 - 900',
    'Co-Applicant Monthly Income': '20000',
    'Co-Applicant Age': '30',
    'Relation with the Co-Applicant': 'Brother',
    State: 'Maharashtra'
  }
];

const report = mockReconciler.reconcile(sampleRecords);
assert.strictEqual(report.dataset_metrics.total_records_analyzed, 3);
assert.strictEqual(report.dataset_metrics.unique_uids, 3);
assert.strictEqual(report.contradiction_summary.confirmed_disbursed_matches, 1);
assert.strictEqual(report.contradiction_summary.false_rejections_count, 1);
assert.strictEqual(report.contradiction_summary.external_lenders_count, 1);
assert.strictEqual(report.external_lender_breakdown.feemonk, 1);
console.log('✓ Test 2: In-memory reconciliation accurately separates matches, contradictions, and external partners');

console.log('✓ All Reconciliation unit tests passed successfully.');
