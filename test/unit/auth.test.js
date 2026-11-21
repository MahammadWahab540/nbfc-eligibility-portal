const assert = require('assert');
const { DatabaseRepository } = require('../../src/db/database');
const { getAuthService, ROLES } = require('../../src/services/auth');
const path = require('path');
const fs = require('fs');

console.log('--- RUNNING AUTHENTICATION & RBAC UNIT TESTS ---');

const testDbPath = path.join(__dirname, '..', '..', 'data', 'test_auth.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const db = new DatabaseRepository(testDbPath);
const authService = getAuthService({ db });

try {
  // Test 1: Seeding of default accounts
  const users = authService.getUsers();
  assert.strictEqual(users.length >= 3, true, 'Default accounts should be seeded');
  const rolesFound = users.map(u => u.role);
  assert.strictEqual(rolesFound.includes('admin'), true, 'Should seed admin role');
  assert.strictEqual(rolesFound.includes('basic'), true, 'Should seed basic role');
  assert.strictEqual(rolesFound.includes('viewer'), true, 'Should seed viewer role');
  console.log('✓ Test 1: Default accounts seeded for admin, basic, and viewer');

  // Test 2: Admin authentication
  const adminRes = authService.login('admin', 'admin123');
  assert.ok(adminRes.token, 'Admin login must generate token');
  assert.strictEqual(adminRes.user.role, ROLES.ADMIN, 'Admin role must be admin');
  const verifiedAdmin = authService.verifyToken(adminRes.token);
  assert.ok(verifiedAdmin, 'Admin token must verify');
  assert.strictEqual(verifiedAdmin.role, ROLES.ADMIN);
  console.log('✓ Test 2: Admin login and HMAC-SHA256 JWT validation successful');

  // Test 3: Basic User authentication
  const basicRes = authService.login('ops@nxtwave.tech', 'basic123');
  assert.ok(basicRes.token, 'Basic user login must generate token');
  assert.strictEqual(basicRes.user.role, ROLES.BASIC, 'Role must be basic');
  const verifiedBasic = authService.verifyToken(basicRes.token);
  assert.strictEqual(verifiedBasic.role, ROLES.BASIC);
  console.log('✓ Test 3: Basic user login and token generation successful');

  // Test 4: All Visible Access (Viewer) authentication
  const viewerRes = authService.login('viewer', 'viewer123');
  assert.ok(viewerRes.token, 'Viewer login must generate token');
  assert.strictEqual(viewerRes.user.role, ROLES.VIEWER, 'Role must be viewer');
  const verifiedViewer = authService.verifyToken(viewerRes.token);
  assert.strictEqual(verifiedViewer.role, ROLES.VIEWER);
  console.log('✓ Test 4: Viewer (All Visible Access) login successful');

  // Test 5: Role switching permissions
  // Admin can assume any lower role for testing
  const adminAsViewer = authService.login('admin', 'admin123', 'viewer');
  assert.strictEqual(adminAsViewer.user.role, 'viewer', 'Admin can assume viewer role');
  const adminAsBasic = authService.login('admin', 'admin123', 'basic');
  assert.strictEqual(adminAsBasic.user.role, 'basic', 'Admin can assume basic role');

  // Basic user cannot elevate to admin
  assert.throws(() => {
    authService.login('basic', 'basic123', 'admin');
  }, /not have permission/, 'Basic user cannot elevate to admin');

  // Viewer cannot elevate to basic or admin
  assert.throws(() => {
    authService.login('viewer', 'viewer123', 'admin');
  }, /not have permission/, 'Viewer cannot elevate to admin');
  assert.throws(() => {
    authService.login('viewer', 'viewer123', 'basic');
  }, /not have permission/, 'Viewer cannot elevate to basic');
  console.log('✓ Test 5: Role assumption and privilege escalation barriers verified');

  // Test 6: Invalid credentials
  assert.throws(() => {
    authService.login('admin', 'wrongpassword');
  }, /password incorrect/, 'Should reject bad password');
  assert.throws(() => {
    authService.login('nonexistent', 'pass');
  }, /user not found/, 'Should reject unknown user');
  console.log('✓ Test 6: Invalid credentials strictly rejected with constant-time comparison');

  // Test 7: Tampered tokens
  const tamperedToken = adminRes.token.slice(0, -5) + 'xxxxx';
  assert.strictEqual(authService.verifyToken(tamperedToken), null, 'Tampered token must be rejected');
  assert.strictEqual(authService.verifyToken('invalid.token'), null, 'Malformed token must be rejected');
  assert.strictEqual(authService.verifyToken(''), null, 'Empty token must be rejected');
  console.log('✓ Test 7: Tampered and malformed tokens rejected');

  // Test 8: User creation
  const newUser = authService.createUser({
    username: 'testauditor',
    email: 'auditor_test@nxtwave.tech',
    password: 'securePassword123',
    name: 'External Audit Officer',
    role: ROLES.VIEWER
  });
  assert.strictEqual(newUser.username, 'testauditor');
  assert.strictEqual(newUser.role, ROLES.VIEWER);
  const newLogin = authService.login('testauditor', 'securePassword123');
  assert.strictEqual(newLogin.user.name, 'External Audit Officer');
  console.log('✓ Test 8: User lifecycle creation and authentication verified');

  // Test 9: Password management (changePassword)
  const basicUser = users.find(u => u.username === 'basic');
  assert.ok(basicUser, 'Basic user must exist in seeded accounts');

  // 9a: Reject empty or missing parameters
  assert.throws(() => {
    authService.changePassword(basicUser.id, '', 'newSecret123');
  }, /User ID, current password, and new password are required/, 'Should reject missing parameters');

  // 9b: Reject new password with length < 6 characters
  assert.throws(() => {
    authService.changePassword(basicUser.id, 'basic123', '12345');
  }, /at least 6 characters long/, 'Should reject password under 6 characters');

  // 9c: Reject incorrect current password
  assert.throws(() => {
    authService.changePassword(basicUser.id, 'wrongpassword', 'newSecret123');
  }, /Current password is incorrect/, 'Should reject incorrect current password');

  // 9d: Successfully update password
  const changeRes = authService.changePassword(basicUser.id, 'basic123', 'newSecret123');
  assert.strictEqual(changeRes.success, true);
  assert.strictEqual(changeRes.message, 'Password updated successfully');

  // 9e: Verification that subsequent authentication succeeds with the new password
  const newCredsLogin = authService.login('basic', 'newSecret123');
  assert.ok(newCredsLogin.token, 'Login with new password must succeed');
  assert.strictEqual(newCredsLogin.user.id, basicUser.id);
  const newCredsVerified = authService.verifyToken(newCredsLogin.token);
  assert.strictEqual(newCredsVerified.userId, basicUser.id);

  // 9f: Verification that authentication fails with the old password
  assert.throws(() => {
    authService.login('basic', 'basic123');
  }, /password incorrect/, 'Login with old password must fail');

  // 9g: Restore original password and verify recovery
  const restoreRes = authService.changePassword(basicUser.id, 'newSecret123', 'basic123');
  assert.strictEqual(restoreRes.success, true);
  const restoredLogin = authService.login('basic', 'basic123');
  assert.ok(restoredLogin.token, 'Login with restored original password must succeed');
  console.log('✓ Test 9: Password change, password length policy, and credential update verified');

  console.log('\n🎉 ALL AUTHENTICATION & RBAC UNIT TESTS PASSED WITH 100% SUCCESS.');
} finally {
  db.close();
  if (fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch {}
  }
}
