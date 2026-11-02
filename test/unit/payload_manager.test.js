/**
 * Business-Configurable Payload Management System Test Suite
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { PayloadManagerService } = require('../../src/services/payload_manager');

console.log('--- RUNNING PAYLOAD MANAGEMENT SYSTEM UNIT TESTS ---');

// Use a temporary test data path to avoid mutating real production configs during testing
const testDataDir = path.join(__dirname, '..', '..', 'data_test_payload');
if (!fs.existsSync(testDataDir)) fs.mkdirSync(testDataDir, { recursive: true });

const manager = new PayloadManagerService({ dataPath: testDataDir });

// -------------------------------------------------------------
// Test 1: Team and Program Metadata
// -------------------------------------------------------------
const meta = manager.getTeamsAndPrograms();
assert.strictEqual(meta.teams.length, 3, 'Must support 3 business teams');
const teamIds = meta.teams.map(t => t.id);
assert(teamIds.includes('onboarding'), 'Must include Onboarding Team');
assert(teamIds.includes('retargeting'), 'Must include Retargeting Team');
assert(teamIds.includes('retention'), 'Must include Retention Team');

assert.strictEqual(meta.programs.length, 3, 'Must support 3 programs');
const progIds = meta.programs.map(p => p.id);
assert(progIds.includes('genies'), 'Must include Genies');
assert(progIds.includes('smart'), 'Must include Smart');
assert(progIds.includes('edge'), 'Must include Edge');
console.log('✓ Test 1: Teams and Programs metadata correctly loaded (Retargeting, Onboarding, Retention x Genies, Smart, Edge)');

// -------------------------------------------------------------
// Test 2: Configuration Resolution & Inheritance
// -------------------------------------------------------------
// A. Onboarding -> Genies
const onbGenies = manager.getResolvedConfiguration('onboarding', 'genies');
assert(onbGenies.fields.length > 0, 'Onboarding -> Genies must have fields');
const userIdField = onbGenies.fields.find(f => f.key === 'userId');
assert(userIdField, 'Must inherit base field userId');
assert.strictEqual(userIdField.inherited_from, 'team_base', 'userId must be marked as inherited from team base');

const geniesDeviceField = onbGenies.fields.find(f => f.key === 'has_laptop_and_wifi');
assert(geniesDeviceField, 'Must include Genies program-specific field has_laptop_and_wifi');
assert.strictEqual(geniesDeviceField.inherited_from, 'program_specific', 'Device field must be marked as program specific');

// B. Onboarding -> Edge (Overrides)
const onbEdge = manager.getResolvedConfiguration('onboarding', 'edge');
const edgeIncome = onbEdge.fields.find(f => f.key === 'Co-Applicant Monthly Income');
assert.strictEqual(edgeIncome.is_overridden, true, 'Income field should be overridden for Edge');
assert.strictEqual(edgeIncome.default_value, 35000, 'Edge income default should be overridden to 35,000');
assert.strictEqual(edgeIncome.validation.min, 25000, 'Edge minimum income floor should be 25,000');
console.log('✓ Test 2: Configuration inheritance correctly merges base fields, program fields, and overrides');

// -------------------------------------------------------------
// Test 3: Payload Validation Engine
// -------------------------------------------------------------
// Valid payload for Onboarding -> Genies
const validGeniesPayload = {
  userId: 'user_test_01',
  'Academy PRE -Loan Journey Name': 'Rajesh Kumar',
  'CIBIL Score Range': '700 - 900',
  'Relation with the Co-Applicant': 'Father',
  'Co-Applicant Monthly Income': '₹30,000',
  'Co-Applicant Age': '48',
  "Co-Applicant's Bank Name": 'HDFC',
  State: 'Karnataka',
  has_laptop_and_wifi: true
};

const valRes1 = manager.validatePayload('onboarding', 'genies', validGeniesPayload);
assert.strictEqual(valRes1.valid, true, 'Valid payload must pass validation');
assert.strictEqual(valRes1.missing_mandatory_fields.length, 0);
assert.strictEqual(valRes1.sanitized_payload['Co-Applicant Monthly Income'], 30000, 'Currency string must be parsed to 30000');
console.log('✓ Test 3a: Valid payload passes validation with currency normalization');

// Missing mandatory field
const invalidGeniesPayload = {
  // Missing userId
  'Academy PRE -Loan Journey Name': 'Rajesh Kumar',
  'CIBIL Score Range': '700 - 900',
  'Relation with the Co-Applicant': 'Father',
  'Co-Applicant Monthly Income': '20000',
  'Co-Applicant Age': 45,
  "Co-Applicant's Bank Name": 'HDFC',
  State: 'Karnataka',
  has_laptop_and_wifi: true
};
const valRes2 = manager.validatePayload('onboarding', 'genies', invalidGeniesPayload);
assert.strictEqual(valRes2.valid, false, 'Missing mandatory userId must fail validation');
assert(valRes2.missing_mandatory_fields.some(f => f.field_key === 'userId'), 'Should identify userId as missing');
console.log('✓ Test 3b: Missing mandatory field is strictly caught');

// Dropdown constraint validation
const invalidDropdownPayload = {
  ...validGeniesPayload,
  'Relation with the Co-Applicant': 'Neighbor' // Not in allowed list
};
const valRes3 = manager.validatePayload('onboarding', 'genies', invalidDropdownPayload);
assert.strictEqual(valRes3.valid, false, 'Invalid dropdown option must fail validation');
assert(valRes3.validation_errors.some(e => e.rule === 'DROPDOWN_OPTION'), 'Should flag DROPDOWN_OPTION error');
console.log('✓ Test 3c: Dropdown constraints strictly enforced');

// -------------------------------------------------------------
// Test 4: Draft and Publish Lifecycle
// -------------------------------------------------------------
const initialConfig = manager.getResolvedConfiguration('retargeting', 'smart');
assert.strictEqual(initialConfig.version, '1.0.0');

// Modify fields and save as draft
const draftFields = [
  ...initialConfig.fields,
  {
    id: 'f_test_discount_reason',
    key: 'discount_approval_reason',
    label: 'Discount Approval Reason',
    type: 'text',
    required: true,
    enabled: true,
    priority: 'High',
    default_value: 'Festive promo'
  }
];

manager.saveDraft('retargeting', 'smart', draftFields, 'Test User', 'Added discount reason field');

// Active configuration must remain on 1.0.0 and NOT include the new field
const activeBeforePublish = manager.getResolvedConfiguration('retargeting', 'smart');
assert.strictEqual(activeBeforePublish.has_unpublished_draft, true);
assert.strictEqual(activeBeforePublish.fields.some(f => f.key === 'discount_approval_reason'), false,
  'Active config must NOT show unpublished draft fields');

// Draft configuration must show the new field
const draftConfig = manager.getDraftConfiguration('retargeting', 'smart');
assert.strictEqual(draftConfig.is_draft, true);
assert.strictEqual(draftConfig.fields.some(f => f.key === 'discount_approval_reason'), true,
  'Draft config MUST include the newly added field');

// Publish the draft
const pubRes = manager.publishConfiguration('retargeting', 'smart', 'Test Admin', 'Promoted discount reason to live');
assert.strictEqual(pubRes.version, '1.1.0', 'Version must increment to 1.1.0');

// Active configuration now has 1.1.0 and the new field
const activeAfterPublish = manager.getResolvedConfiguration('retargeting', 'smart');
assert.strictEqual(activeAfterPublish.version, '1.1.0');
assert.strictEqual(activeAfterPublish.has_unpublished_draft, false);
assert.strictEqual(activeAfterPublish.fields.some(f => f.key === 'discount_approval_reason'), true);
console.log('✓ Test 4: Draft and Publish lifecycle operates cleanly with version incrementing');

// -------------------------------------------------------------
// Test 5: Version History & Rollback
// -------------------------------------------------------------
const history = manager.getVersionHistory('retargeting', 'smart');
assert(history.versions.length >= 2, 'History must contain active version and previous 1.0.0 version');
const v1Snapshot = history.versions.find(v => v.version === '1.0.0');
assert(v1Snapshot, 'Must find 1.0.0 in history');

// Rollback to 1.0.0
const rollbackRes = manager.rollbackVersion('retargeting', 'smart', '1.0.0', 'Ops Manager');
assert.strictEqual(rollbackRes.version, '1.0.0');

const activeAfterRollback = manager.getResolvedConfiguration('retargeting', 'smart');
assert.strictEqual(activeAfterRollback.version, '1.0.0');
assert.strictEqual(activeAfterRollback.fields.some(f => f.key === 'discount_approval_reason'), false,
  'After rollback, discount field must be absent');
console.log('✓ Test 5: Version history tracking and 1-click rollback restore previous configuration state');

// -------------------------------------------------------------
// Test 6: Sample Mock Payload Generator
// -------------------------------------------------------------
const sample = manager.generateSamplePayload('retention', 'edge');
assert(sample.payload, 'Must generate mock payload');
assert(sample.payload.student_enrollment_id, 'Must generate sample student ID');
assert(sample.payload.mock_interview_rating, 'Must generate sample dropdown value');
console.log('✓ Test 6: Sample mock payload generated cleanly for Team x Program combinations');

// Clean up temporary test data directory
try {
  fs.rmSync(testDataDir, { recursive: true, force: true });
} catch (e) {}

console.log('\n🎉 ALL PAYLOAD MANAGEMENT SYSTEM UNIT TESTS PASSED CLEANLY.');
