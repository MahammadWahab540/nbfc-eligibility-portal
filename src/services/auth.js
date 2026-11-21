/**
 * Authentication and Role-Based Access Control (RBAC) Service
 * Zero external dependencies — uses Node.js native 'node:crypto'
 * Implements RFC 7519 standard HMAC-SHA256 JWT generation and validation,
 * scrypt password hashing, and user lifecycle management.
 */

const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'nbfc-portal-secure-internal-hmac-secret-key-2026';
const TOKEN_EXPIRY_HOURS = 24;

// Supported roles
const ROLES = {
  ADMIN: 'admin',      // Full read/write, rules editing, status toggling, reordering, settings, payloads
  BASIC: 'basic',      // Check eligibility, KYC simulator, select lender, read-only rules
  VIEWER: 'viewer'     // All visible access: full visibility across all tabs, but strictly read-only
};

class AuthService {
  constructor({ db }) {
    this.db = db;
    this.init();
  }

  /**
   * Ensure user table exists and seed default accounts for all 3 roles
   */
  init() {
    if (!this.db || !this.db.db) return;

    this.db.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'basic', 'viewer')),
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);

    this.seedDefaultUsers();
  }

  hashPassword(password, salt) {
    return crypto.scryptSync(password, salt, 64).toString('hex');
  }

  seedDefaultUsers() {
    const existing = this.db.db.prepare('SELECT COUNT(*) as count FROM users').get();
    if (existing && existing.count > 0) return;

    const defaultAccounts = [
      {
        id: 'usr_admin_001',
        username: 'admin',
        email: 'admin@nxtwave.tech',
        password: 'admin123',
        name: 'Risk Operations Admin',
        role: ROLES.ADMIN
      },
      {
        id: 'usr_basic_002',
        username: 'basic',
        email: 'ops@nxtwave.tech',
        password: 'basic123',
        name: 'Operations Agent',
        role: ROLES.BASIC
      },
      {
        id: 'usr_viewer_003',
        username: 'viewer',
        email: 'auditor@nxtwave.tech',
        password: 'viewer123',
        name: 'Compliance Auditor',
        role: ROLES.VIEWER
      }
    ];

    const insertStmt = this.db.db.prepare(`
      INSERT OR REPLACE INTO users (id, username, email, password_hash, salt, name, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    for (const acc of defaultAccounts) {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = this.hashPassword(acc.password, salt);
      insertStmt.run(acc.id, acc.username, acc.email, hash, salt, acc.name, acc.role, now);
    }
  }

  /**
   * Authenticate a user by username or email and verify password
   * Optionally allows assuming a lower/valid role for the session
   */
  login(usernameOrEmail, password, requestedRole = null) {
    if (!usernameOrEmail || !password) {
      throw new Error('Username/email and password are required');
    }

    const cleanIdentifier = String(usernameOrEmail).trim().toLowerCase();
    const stmt = this.db.db.prepare(`
      SELECT * FROM users WHERE LOWER(username) = ? OR LOWER(email) = ?
    `);
    const user = stmt.get(cleanIdentifier, cleanIdentifier);

    if (!user) {
      throw new Error('Invalid credentials: user not found');
    }

    const testHash = this.hashPassword(password, user.salt);
    const hashBuf = Buffer.from(testHash, 'hex');
    const userBuf = Buffer.from(user.password_hash, 'hex');

    if (hashBuf.length !== userBuf.length || !crypto.timingSafeEqual(hashBuf, userBuf)) {
      throw new Error('Invalid credentials: password incorrect');
    }

    // Role resolution:
    // If user is admin, they can log in as any role (admin, basic, or viewer) to test role views
    // If user is basic, they can be basic or viewer
    // If user is viewer, they can only be viewer
    let effectiveRole = user.role;
    if (requestedRole) {
      const reqRole = requestedRole.toLowerCase().trim();
      if (!Object.values(ROLES).includes(reqRole)) {
        throw new Error(`Invalid role requested: ${requestedRole}. Allowed: admin, basic, viewer`);
      }
      if (user.role === ROLES.ADMIN) {
        effectiveRole = reqRole;
      } else if (user.role === ROLES.BASIC && reqRole !== ROLES.ADMIN) {
        effectiveRole = reqRole;
      } else if (user.role === ROLES.VIEWER && reqRole === ROLES.VIEWER) {
        effectiveRole = reqRole;
      } else {
        throw new Error(`Your account does not have permission to assume role: ${requestedRole}`);
      }
    }

    const token = this.generateToken({
      userId: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      baseRole: user.role,
      role: effectiveRole
    });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        baseRole: user.role,
        role: effectiveRole
      }
    };
  }

  /**
   * RFC 7519 HMAC-SHA256 JWT Generator
   */
  generateToken(payload) {
    const header = {
      alg: 'HS256',
      typ: 'JWT'
    };

    const nowSeconds = Math.floor(Date.now() / 1000);
    const expSeconds = nowSeconds + (TOKEN_EXPIRY_HOURS * 3600);

    const fullPayload = {
      ...payload,
      iat: nowSeconds,
      exp: expSeconds
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
    const dataToSign = `${encodedHeader}.${encodedPayload}`;

    const signature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(dataToSign)
      .digest('base64url');

    return `${dataToSign}.${signature}`;
  }

  /**
   * Validate and decode HMAC-SHA256 JWT
   */
  verifyToken(token) {
    if (!token || typeof token !== 'string') return null;

    const parts = token.trim().split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    const dataToSign = `${encodedHeader}.${encodedPayload}`;

    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(dataToSign)
      .digest('base64url');

    const expectedBuf = Buffer.from(expectedSignature);
    const actualBuf = Buffer.from(signature);

    if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      return null;
    }

    try {
      const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < nowSeconds) {
        return null; // Expired
      }
      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Create a new user
   */
  createUser({ username, email, password, name, role = ROLES.BASIC }) {
    if (!username || !email || !password || !name) {
      throw new Error('All fields (username, email, password, name) are required');
    }
    const cleanRole = role.toLowerCase().trim();
    if (!Object.values(ROLES).includes(cleanRole)) {
      throw new Error(`Invalid role: ${role}. Must be admin, basic, or viewer`);
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = this.hashPassword(password, salt);
    const id = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    const stmt = this.db.db.prepare(`
      INSERT INTO users (id, username, email, password_hash, salt, name, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, username.trim().toLowerCase(), email.trim().toLowerCase(), hash, salt, name.trim(), cleanRole, now);

    return {
      id,
      username: username.trim().toLowerCase(),
      email: email.trim().toLowerCase(),
      name: name.trim(),
      role: cleanRole,
      created_at: now
    };
  }

  getUsers() {
    const stmt = this.db.db.prepare('SELECT id, username, email, name, role, created_at FROM users ORDER BY created_at ASC');
    return stmt.all();
  }

  /**
   * Securely update password for an authenticated user
   */
  changePassword(userId, currentPassword, newPassword) {
    if (!userId || !currentPassword || !newPassword) {
      throw new Error('User ID, current password, and new password are required');
    }
    if (newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters long');
    }

    const stmt = this.db.db.prepare('SELECT * FROM users WHERE id = ?');
    const user = stmt.get(userId);
    if (!user) {
      throw new Error('User account not found');
    }

    const testHash = this.hashPassword(currentPassword, user.salt);
    const hashBuf = Buffer.from(testHash, 'hex');
    const userBuf = Buffer.from(user.password_hash, 'hex');

    if (hashBuf.length !== userBuf.length || !crypto.timingSafeEqual(hashBuf, userBuf)) {
      throw new Error('Current password is incorrect');
    }

    const newSalt = crypto.randomBytes(16).toString('hex');
    const newHash = this.hashPassword(newPassword, newSalt);

    const updateStmt = this.db.db.prepare(`
      UPDATE users SET password_hash = ?, salt = ? WHERE id = ?
    `);
    updateStmt.run(newHash, newSalt, userId);

    return {
      success: true,
      message: 'Password updated successfully'
    };
  }
}

let authInstance = null;
function getAuthService({ db }) {
  if (!authInstance || db) {
    authInstance = new AuthService({ db });
  }
  return authInstance;
}

module.exports = {
  AuthService,
  getAuthService,
  ROLES
};
