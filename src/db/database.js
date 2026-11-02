/**
 * Persistent Storage Layer for NBFC Eligibility Engine
 * Uses Node.js 24 Built-In SQLite (node:sqlite DatabaseSync)
 * Provides ACID-compliant persistence for evaluations, selections, audit trails, and rule versions.
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

class DatabaseRepository {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(__dirname, '..', '..', 'data', 'nbfc.db');
    // Ensure data directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.init();
  }

  init() {
    this.db = new DatabaseSync(this.dbPath);
    // Performance and integrity pragmas
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');

    // 1. Evaluations Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS evaluations (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        rules_version TEXT NOT NULL,
        salesforce_id TEXT,
        user_applicant_id TEXT,
        evaluation_status TEXT NOT NULL,
        decision_type TEXT NOT NULL,
        inputs_json TEXT NOT NULL,
        eligible_count INTEGER NOT NULL DEFAULT 0,
        conditional_count INTEGER NOT NULL DEFAULT 0,
        ineligible_count INTEGER NOT NULL DEFAULT 0,
        results_json TEXT NOT NULL,
        selected_lender TEXT,
        selection_timestamp TEXT,
        salesforce_sync_status TEXT,
        salesforce_sync_response TEXT,
        idempotency_key TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_eval_created ON evaluations(created_at);
      CREATE INDEX IF NOT EXISTS idx_eval_sf_id ON evaluations(salesforce_id);
      CREATE INDEX IF NOT EXISTS idx_eval_idempotency ON evaluations(idempotency_key);
    `);

    // 2. Audit Trail Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        user TEXT NOT NULL,
        action TEXT NOT NULL,
        entity TEXT NOT NULL,
        details TEXT NOT NULL,
        version TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(timestamp);
    `);

    // 3. Rule Versions & Lifecycle Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rule_versions (
        version TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK(status IN ('DRAFT', 'VALIDATION', 'APPROVAL', 'ACTIVE', 'ARCHIVED')),
        created_at TEXT NOT NULL,
        created_by TEXT NOT NULL,
        approved_by TEXT,
        rules_json TEXT NOT NULL
      );

      -- 4. Payload Configurations Table (Team x Program)
      CREATE TABLE IF NOT EXISTS payload_configurations (
        team_id TEXT NOT NULL,
        program_id TEXT NOT NULL,
        version TEXT NOT NULL,
        status TEXT NOT NULL,
        config_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_by TEXT NOT NULL,
        change_summary TEXT,
        PRIMARY KEY (team_id, program_id, version)
      );
      CREATE INDEX IF NOT EXISTS idx_payload_team_prog ON payload_configurations(team_id, program_id);
    `);
  }

  saveEvaluation(evaluation) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO evaluations (
        id, created_at, rules_version, salesforce_id, user_applicant_id,
        evaluation_status, decision_type, inputs_json,
        eligible_count, conditional_count, ineligible_count,
        results_json, selected_lender, selection_timestamp,
        salesforce_sync_status, salesforce_sync_response, idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      evaluation.id,
      evaluation.created_at || new Date().toISOString(),
      evaluation.rules_version || '1.1.0',
      evaluation.salesforce_id || null,
      evaluation.user_applicant_id || null,
      evaluation.evaluation_status || 'PROCESSED',
      evaluation.decision_type || 'STANDARD',
      typeof evaluation.inputs === 'string' ? evaluation.inputs : JSON.stringify(evaluation.inputs || {}),
      evaluation.eligible_count || 0,
      evaluation.conditional_count || 0,
      evaluation.ineligible_count || 0,
      typeof evaluation.results === 'string' ? evaluation.results : JSON.stringify(evaluation.results || {}),
      evaluation.selected_lender || null,
      evaluation.selection_timestamp || null,
      evaluation.salesforce_sync_status || null,
      evaluation.salesforce_sync_response || null,
      evaluation.idempotency_key || null
    );

    return evaluation;
  }

  getEvaluationById(id) {
    const stmt = this.db.prepare('SELECT * FROM evaluations WHERE id = ?');
    const row = stmt.get(id);
    if (!row) return null;
    return this._formatEvaluationRow(row);
  }

  getEvaluationByIdempotency(idempotencyKey) {
    if (!idempotencyKey) return null;
    const stmt = this.db.prepare('SELECT * FROM evaluations WHERE idempotency_key = ?');
    const row = stmt.get(idempotencyKey);
    if (!row) return null;
    return this._formatEvaluationRow(row);
  }

  updateSelection(id, selectedLender, syncStatus, syncResponse) {
    const stmt = this.db.prepare(`
      UPDATE evaluations
      SET selected_lender = ?,
          selection_timestamp = ?,
          salesforce_sync_status = ?,
          salesforce_sync_response = ?
      WHERE id = ?
    `);
    const now = new Date().toISOString();
    stmt.run(selectedLender, now, syncStatus, JSON.stringify(syncResponse || {}), id);
    return this.getEvaluationById(id);
  }

  getRecentEvaluations(limit = 50) {
    const stmt = this.db.prepare('SELECT * FROM evaluations ORDER BY created_at DESC LIMIT ?');
    const rows = stmt.all(limit);
    return rows.map(r => this._formatEvaluationRow(r));
  }

  recordAudit(user, action, entity, details, version = '1.1.0') {
    const id = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const timestamp = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (id, timestamp, user, action, entity, details, version)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, timestamp, user, action, entity, details, version);
    return { id, timestamp, user, action, entity, details, version };
  }

  getAuditLogs(limit = 100) {
    const stmt = this.db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?');
    return stmt.all(limit);
  }

  _formatEvaluationRow(row) {
    return {
      id: row.id,
      created_at: row.created_at,
      rules_version: row.rules_version,
      salesforce_id: row.salesforce_id,
      user_applicant_id: row.user_applicant_id,
      evaluation_status: row.evaluation_status,
      decision_type: row.decision_type,
      inputs: JSON.parse(row.inputs_json || '{}'),
      eligible_count: row.eligible_count,
      conditional_count: row.conditional_count,
      ineligible_count: row.ineligible_count,
      results: JSON.parse(row.results_json || '{}'),
      selected_lender: row.selected_lender,
      selection_timestamp: row.selection_timestamp,
      salesforce_sync_status: row.salesforce_sync_status,
      salesforce_sync_response: row.salesforce_sync_response ? JSON.parse(row.salesforce_sync_response) : null,
      idempotency_key: row.idempotency_key
    };
  }

  close() {
    this.db.close();
  }
}

// Singleton instance
let defaultRepo = null;
function getDatabaseRepository(dbPath) {
  if (!defaultRepo || dbPath) {
    defaultRepo = new DatabaseRepository(dbPath);
  }
  return defaultRepo;
}

module.exports = {
  DatabaseRepository,
  getDatabaseRepository
};
