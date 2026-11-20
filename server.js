/**
 * Production NBFC Eligibility Engine & Salesforce Integration Server
 * Serves REST APIs, Persistence Layer (SQLite), and Static Configuration Dashboard UI
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const NBFCEligibilityEngine = require('./src/engine/index');
const { getDatabaseRepository } = require('./src/db/database');
const SalesforceSyncService = require('./src/services/salesforce_sync');
const { getPayloadManagerService } = require('./src/services/payload_manager');

const db = getDatabaseRepository();
const engine = new NBFCEligibilityEngine({ dataPath: path.join(__dirname, 'data'), db });
const sfSyncService = new SalesforceSyncService({ db });
const payloadManager = getPayloadManagerService({ db, dataPath: path.join(__dirname, 'data') });

const PORT = process.env.PORT || 3000;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || null;

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON format'));
      }
    });
  });
}

function serveStaticFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    }
  });
}

function checkAdminAuth(req) {
  if (!ADMIN_API_KEY) return true; // Open if not explicitly configured
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  return token === ADMIN_API_KEY;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Global CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Idempotency-Key');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
    // -------------------------------------------------------------
    // STATIC ASSETS
    // -------------------------------------------------------------
    if (req.method === 'GET') {
      if (pathname === '/' || pathname === '/index.html') {
        return serveStaticFile(res, path.join(__dirname, 'public', 'index.html'), 'text/html');
      }
      if (pathname === '/app.js') {
        return serveStaticFile(res, path.join(__dirname, 'public', 'app.js'), 'application/javascript');
      }
      if (pathname === '/styles.css') {
        return serveStaticFile(res, path.join(__dirname, 'public', 'styles.css'), 'text/css');
      }
      if (pathname === '/favicon.ico') {
        res.writeHead(204);
        return res.end();
      }
    }

    // -------------------------------------------------------------
    // API: SYSTEM HEALTH & READINESS
    // -------------------------------------------------------------
    if (req.method === 'GET' && pathname === '/health') {
      engine.loadData();
      return sendJSON(res, 200, {
        status: 'HEALTHY',
        version: engine.ruleSet.version || '1.2.0',
        active_partners: engine.ruleSet.partners.filter(p => p.is_active).length,
        persistence: 'SQLite (node:sqlite DatabaseSync)',
        salesforce_sync_adapter: sfSyncService.syncUrl ? 'LIVE_HTTPS' : 'VERIFIED_MOCK_ADAPTER',
        timestamp: new Date().toISOString()
      });
    }

    // -------------------------------------------------------------
    // API: GET PARTNERS & RULES
    // -------------------------------------------------------------
    if (req.method === 'GET' && pathname === '/api/v1/partners') {
      engine.loadData();
      return sendJSON(res, 200, {
        version: engine.ruleSet.version,
        last_updated: engine.ruleSet.last_updated,
        partners: engine.ruleSet.partners.sort((a, b) => a.priority - b.priority)
      });
    }

    // -------------------------------------------------------------
    // API: CREATE NEW NBFC LENDING PARTNER (ADMIN AUTH PROTECTED)
    // -------------------------------------------------------------
    if (req.method === 'POST' && pathname === '/api/v1/partners') {
      if (!checkAdminAuth(req)) {
        return sendJSON(res, 401, { error: 'Unauthorized', message: 'Valid Admin Bearer token required' });
      }

      const body = await parseBody(req);
      if (!body.name || !body.name.trim()) {
        return sendJSON(res, 400, { error: 'Partner name is required' });
      }

      engine.loadData();
      const rawId = (body.id || body.code || body.name).toLowerCase().replace(/[^a-z0-9]/g, '_');
      const partnerId = rawId.replace(/^_+|_+$/g, '');
      const code = (body.code || partnerId).toUpperCase();

      const existing = engine.ruleSet.partners.find(p => p.id === partnerId || p.code === code);
      if (existing) {
        return sendJSON(res, 409, { error: `Partner with identifier '${partnerId}' or code '${code}' already exists.` });
      }

      const nextPriority = body.priority ? parseInt(body.priority, 10) : (engine.ruleSet.partners.length + 1);

      const newPartner = {
        id: partnerId,
        code: code,
        name: body.name.trim(),
        is_active: body.is_active !== undefined ? Boolean(body.is_active) : true,
        priority: nextPriority,
        description: body.description || `${body.name.trim()} NBFC Lending Partner`,
        discrepancy_status: 'ALIGNED',
        discrepancy_notes: 'Newly added lending partner configured via Partner Portal.',
        criteria: {
          cibil_min: body.criteria?.cibil_min !== undefined ? parseInt(body.criteria.cibil_min, 10) : 650,
          monthly_income_min: body.criteria?.monthly_income_min !== undefined ? parseFloat(body.criteria.monthly_income_min) : 18000,
          monthly_income_hard_min: body.criteria?.monthly_income_hard_min !== undefined ? parseFloat(body.criteria.monthly_income_hard_min) : 18000,
          age_min: body.criteria?.age_min !== undefined ? parseInt(body.criteria.age_min, 10) : 21,
          age_max: body.criteria?.age_max !== undefined ? parseInt(body.criteria.age_max, 10) : 58,
          age_max_with_exception: body.criteria?.age_max_with_exception !== undefined ? parseInt(body.criteria.age_max_with_exception, 10) : 65,
          allowed_relations: Array.isArray(body.criteria?.allowed_relations) && body.criteria.allowed_relations.length > 0
            ? body.criteria.allowed_relations
            : ["Mother", "Father", "Spouse", "Sibling", "Grandfather", "Any relative", "Blood relation"],
          rejected_occupations: Array.isArray(body.criteria?.rejected_occupations)
            ? body.criteria.rejected_occupations
            : ["POLITICIAN", "FREELANCER"],
          rejected_regions: Array.isArray(body.criteria?.rejected_regions)
            ? body.criteria.rejected_regions
            : [],
          pan_aadhaar_linked_mandatory: Boolean(body.criteria?.pan_aadhaar_linked_mandatory),
          pan_card_mandatory: Boolean(body.criteria?.pan_card_mandatory),
          dob_mismatch_allowed: body.criteria?.dob_mismatch_allowed !== undefined ? Boolean(body.criteria.dob_mismatch_allowed) : true,
          name_mismatch_allowed: Boolean(body.criteria?.name_mismatch_allowed),
          non_nationalised_bank_accepted: body.criteria?.non_nationalised_bank_accepted !== undefined ? Boolean(body.criteria.non_nationalised_bank_accepted) : true,
          private_bank_accepted: body.criteria?.private_bank_accepted !== undefined ? Boolean(body.criteria.private_bank_accepted) : true,
          cooperative_bank_accepted: Boolean(body.criteria?.cooperative_bank_accepted),
          door_number_mandatory: Boolean(body.criteria?.door_number_mandatory)
        },
        policy_owner: body.policy_owner || "Credit Underwriting Committee",
        approval_reference: body.approval_reference || `NBFC-ONBOARD-${Date.now().toString().slice(-6)}`,
        effective_date: new Date().toISOString().slice(0, 10)
      };

      engine.ruleSet.partners.push(newPartner);

      const vParts = (engine.ruleSet.version || '2.3.0').split('.');
      vParts[2] = parseInt(vParts[2] || '0', 10) + 1;
      engine.ruleSet.version = vParts.join('.');

      engine.saveRules(engine.ruleSet, body.user || 'Risk Operations Manager', `Onboarded new lending partner ${newPartner.name}`);

      return sendJSON(res, 201, {
        message: `Lending partner ${newPartner.name} created successfully`,
        partner: newPartner,
        version: engine.ruleSet.version
      });
    }

    // -------------------------------------------------------------
    // API: UPDATE SINGLE PARTNER CRITERIA (ADMIN AUTH PROTECTED)
    // -------------------------------------------------------------
    if (req.method === 'PUT' && pathname.match(/^\/api\/v1\/partners\/([^/]+)$/)) {
      if (!checkAdminAuth(req)) {
        return sendJSON(res, 401, { error: 'Unauthorized', message: 'Valid Admin Bearer token required' });
      }

      const partnerId = pathname.split('/').pop().toLowerCase();
      const body = await parseBody(req);
      engine.loadData();

      const partner = engine.ruleSet.partners.find(p => p.id === partnerId);
      if (!partner) {
        return sendJSON(res, 404, { error: 'Partner not found' });
      }

      if (body.name) partner.name = body.name;
      if (body.description !== undefined) partner.description = body.description;
      if (body.priority !== undefined) partner.priority = parseInt(body.priority, 10);
      if (body.is_active !== undefined) partner.is_active = Boolean(body.is_active);
      if (body.criteria) {
        partner.criteria = {
          ...partner.criteria,
          ...body.criteria
        };
      }

      const vParts = (engine.ruleSet.version || '1.2.0').split('.');
      vParts[2] = parseInt(vParts[2] || '0', 10) + 1;
      engine.ruleSet.version = vParts.join('.');

      engine.saveRules(engine.ruleSet, body.user || 'Risk Operations Manager', `Updated rules for ${partner.name}`);

      return sendJSON(res, 200, {
        message: `Criteria updated successfully for ${partner.name}`,
        partner,
        version: engine.ruleSet.version
      });
    }

    // -------------------------------------------------------------
    // API: TOGGLE PARTNER ACTIVE STATUS
    // -------------------------------------------------------------
    if (req.method === 'PATCH' && pathname.match(/^\/api\/v1\/partners\/([^/]+)\/status$/)) {
      if (!checkAdminAuth(req)) {
        return sendJSON(res, 401, { error: 'Unauthorized', message: 'Valid Admin Bearer token required' });
      }

      const partnerId = pathname.split('/')[4].toLowerCase();
      const body = await parseBody(req);
      engine.loadData();

      const partner = engine.ruleSet.partners.find(p => p.id === partnerId);
      if (!partner) {
        return sendJSON(res, 404, { error: 'Partner not found' });
      }

      partner.is_active = body.is_active !== undefined ? Boolean(body.is_active) : !partner.is_active;

      engine.saveRules(
        engine.ruleSet,
        body.user || 'Risk Operations Manager',
        `${partner.is_active ? 'Activated' : 'Deactivated'} partner ${partner.name}`
      );

      return sendJSON(res, 200, {
        message: `Partner status changed to ${partner.is_active ? 'ACTIVE' : 'INACTIVE'}`,
        partner
      });
    }

    // -------------------------------------------------------------
    // API: REORDER PRIORITIES
    // -------------------------------------------------------------
    if (req.method === 'POST' && pathname === '/api/v1/partners/reorder') {
      if (!checkAdminAuth(req)) {
        return sendJSON(res, 401, { error: 'Unauthorized', message: 'Valid Admin Bearer token required' });
      }

      const body = await parseBody(req);
      if (!Array.isArray(body.order)) {
        return sendJSON(res, 400, { error: 'Order must be an array of partner IDs' });
      }

      engine.loadData();
      body.order.forEach((id, index) => {
        const p = engine.ruleSet.partners.find(item => item.id === id);
        if (p) p.priority = index + 1;
      });

      engine.saveRules(
        engine.ruleSet,
        body.user || 'Risk Operations Manager',
        `Reordered partner priorities: ${body.order.join(' > ')}`
      );

      return sendJSON(res, 200, {
        message: 'Priorities updated successfully',
        partners: engine.ruleSet.partners.sort((a, b) => a.priority - b.priority)
      });
    }

    // -------------------------------------------------------------
    // API: GET & UPDATE SETTINGS
    // -------------------------------------------------------------
    if (req.method === 'GET' && pathname === '/api/v1/settings') {
      engine.loadData();
      return sendJSON(res, 200, engine.settings);
    }

    if (req.method === 'PUT' && pathname === '/api/v1/settings') {
      if (!checkAdminAuth(req)) {
        return sendJSON(res, 401, { error: 'Unauthorized', message: 'Valid Admin Bearer token required' });
      }

      const body = await parseBody(req);
      const settingsPath = path.join(engine.dataPath, 'settings.json');
      const updated = { ...engine.settings, ...body };
      fs.writeFileSync(settingsPath, JSON.stringify(updated, null, 2), 'utf8');
      engine.settings = updated;
      engine.recordAudit(body.user || 'Risk Operations Manager', 'UPDATE_SETTINGS', 'SYSTEM_PREFERENCES', 'Adjusted execution preferences');
      return sendJSON(res, 200, { message: 'Settings saved', settings: updated });
    }

    // -------------------------------------------------------------
    // API: GET AUDIT LOGS (FROM SQLITE)
    // -------------------------------------------------------------
    if (req.method === 'GET' && pathname === '/api/v1/audit') {
      const logs = db.getAuditLogs(100);
      return sendJSON(res, 200, { total: logs.length, logs });
    }

    // -------------------------------------------------------------
    // API: EVALUATE KYC PAYLOAD
    // -------------------------------------------------------------
    if (req.method === 'POST' && (pathname === '/api/v1/eligibility/evaluate' || pathname === '/api/evaluate')) {
      const body = await parseBody(req);
      const parameterQuestions = body.parameter_questions || null;
      const idempotencyKey = req.headers['x-idempotency-key'] || body.idempotency_key || null;

      const result = engine.evaluate(body, parameterQuestions, { idempotencyKey });

      return sendJSON(res, 200, result);
    }

    // -------------------------------------------------------------
    // API: EVALUATION HISTORY (PERSISTENT FROM SQLITE)
    // -------------------------------------------------------------
    if (req.method === 'GET' && pathname === '/api/v1/evaluations/history') {
      const rows = db.getRecentEvaluations(50);
      const formatted = rows.map(r => ({
        evaluation_id: r.id,
        timestamp: r.created_at,
        salesforce_id: r.salesforce_id,
        user_applicant_id: r.user_applicant_id,
        eligible_count: r.eligible_count,
        conditional_count: r.conditional_count,
        ineligible_count: r.ineligible_count,
        decision_type: r.decision_type,
        selected_lender: r.selected_lender,
        salesforce_sync_status: r.salesforce_sync_status
      }));

      return sendJSON(res, 200, { history: formatted });
    }

    // -------------------------------------------------------------
    // API: GET SINGLE EVALUATION DETAIL
    // -------------------------------------------------------------
    if (req.method === 'GET' && pathname.match(/^\/api\/v1\/evaluations\/([^/]+)$/)) {
      const evaluationId = pathname.split('/')[4];
      const evaluation = db.getEvaluationById(evaluationId);
      if (!evaluation) {
        return sendJSON(res, 404, { error: 'Evaluation session not found' });
      }
      return sendJSON(res, 200, evaluation);
    }

    // -------------------------------------------------------------
    // API: SELECTION CALLBACK WITH REAL/VERIFIED SYNC
    // -------------------------------------------------------------
    if (req.method === 'POST' && pathname.match(/^\/api\/v1\/eligibility\/([^/]+)\/select$/)) {
      const evaluationId = pathname.split('/')[4];
      const body = await parseBody(req);
      const rawSelectedId = (body.selected_nbfc_id || '').toLowerCase();
      const selectedId = rawSelectedId === 'feemonk' ? 'fibe' : rawSelectedId;
      const idempotencyKey = req.headers['x-idempotency-key'] || body.idempotency_key || null;

      // 1. Fetch persisted evaluation from SQLite
      const evaluation = db.getEvaluationById(evaluationId);
      if (!evaluation) {
        return sendJSON(res, 404, {
          error: 'Evaluation session not found or expired',
          code: 'SESSION_NOT_FOUND'
        });
      }

      // 2. Perform synchronized callback using SalesforceSyncService
      const syncResult = await sfSyncService.syncSelection(evaluation, selectedId, { idempotencyKey });

      if (!syncResult.success && syncResult.sync_status === 'SELECTION_REJECTED') {
        return sendJSON(res, 400, {
          error: 'Invalid lender selection',
          code: 'UNQUALIFIED_SELECTION',
          message: syncResult.error,
          details: syncResult.details
        });
      }

      // 3. Update evaluation in SQLite
      db.updateSelection(evaluationId, selectedId, syncResult.sync_status, syncResult);

      return sendJSON(res, 200, {
        status: 'SUCCESS',
        evaluation_id: evaluationId,
        selected_nbfc_id: selectedId,
        salesforce_sync: syncResult
      });
    }

    // -------------------------------------------------------------
    // API: BUSINESS-CONFIGURABLE PAYLOAD MANAGEMENT SYSTEM
    // -------------------------------------------------------------
    // Meta: Teams, Programs, Field Types, Priorities
    if (req.method === 'GET' && pathname === '/api/v1/payload-configs/meta') {
      return sendJSON(res, 200, payloadManager.getTeamsAndPrograms());
    }

    // Fetch Team x Program Configuration (Active or Draft)
    if (req.method === 'GET' && pathname.match(/^\/api\/v1\/payload-configs\/([^/]+)\/([^/]+)$/)) {
      const parts = pathname.split('/');
      const teamId = parts[4];
      const programId = parts[5];
      const isDraftMode = url.searchParams.get('mode') === 'draft';

      try {
        const config = isDraftMode
          ? payloadManager.getDraftConfiguration(teamId, programId)
          : payloadManager.getResolvedConfiguration(teamId, programId);
        return sendJSON(res, 200, config);
      } catch (err) {
        return sendJSON(res, 404, { error: err.message });
      }
    }

    // Save Draft Fields for Team x Program
    if (req.method === 'PUT' && pathname.match(/^\/api\/v1\/payload-configs\/([^/]+)\/([^/]+)\/draft$/)) {
      const parts = pathname.split('/');
      const teamId = parts[4];
      const programId = parts[5];
      const body = await parseBody(req);

      try {
        const result = payloadManager.saveDraft(
          teamId,
          programId,
          body.fields || [],
          body.user || 'Business User',
          body.summary || 'Updated draft fields'
        );
        return sendJSON(res, 200, result);
      } catch (err) {
        return sendJSON(res, 400, { error: err.message });
      }
    }

    // Publish Draft to Live Version
    if (req.method === 'POST' && pathname.match(/^\/api\/v1\/payload-configs\/([^/]+)\/([^/]+)\/publish$/)) {
      const parts = pathname.split('/');
      const teamId = parts[4];
      const programId = parts[5];
      const body = await parseBody(req);

      try {
        const result = payloadManager.publishConfiguration(
          teamId,
          programId,
          body.user || 'Business Administrator',
          body.change_summary || 'Published updated payload criteria'
        );
        return sendJSON(res, 200, result);
      } catch (err) {
        return sendJSON(res, 400, { error: err.message });
      }
    }

    // Validate a Sample or Real Payload against Schema
    if (req.method === 'POST' && pathname.match(/^\/api\/v1\/payload-configs\/([^/]+)\/([^/]+)\/validate$/)) {
      const parts = pathname.split('/');
      const teamId = parts[4];
      const programId = parts[5];
      const body = await parseBody(req);
      const useDraft = url.searchParams.get('mode') === 'draft';

      try {
        const validation = payloadManager.validatePayload(teamId, programId, body.payload || body, { useDraft });
        return sendJSON(res, 200, validation);
      } catch (err) {
        return sendJSON(res, 400, { error: err.message });
      }
    }

    // Generate Mock Sample Payload
    if (req.method === 'GET' && pathname.match(/^\/api\/v1\/payload-configs\/([^/]+)\/([^/]+)\/sample$/)) {
      const parts = pathname.split('/');
      const teamId = parts[4];
      const programId = parts[5];

      try {
        const sample = payloadManager.generateSamplePayload(teamId, programId);
        return sendJSON(res, 200, sample);
      } catch (err) {
        return sendJSON(res, 400, { error: err.message });
      }
    }

    // Version History
    if (req.method === 'GET' && pathname.match(/^\/api\/v1\/payload-configs\/([^/]+)\/([^/]+)\/history$/)) {
      const parts = pathname.split('/');
      const teamId = parts[4];
      const programId = parts[5];

      try {
        const history = payloadManager.getVersionHistory(teamId, programId);
        return sendJSON(res, 200, history);
      } catch (err) {
        return sendJSON(res, 404, { error: err.message });
      }
    }

    // Rollback to Historical Version
    if (req.method === 'POST' && pathname.match(/^\/api\/v1\/payload-configs\/([^/]+)\/([^/]+)\/rollback$/)) {
      const parts = pathname.split('/');
      const teamId = parts[4];
      const programId = parts[5];
      const body = await parseBody(req);

      if (!body.target_version) {
        return sendJSON(res, 400, { error: 'target_version is required for rollback.' });
      }

      try {
        const result = payloadManager.rollbackVersion(
          teamId,
          programId,
          body.target_version,
          body.user || 'Administrator'
        );
        return sendJSON(res, 200, result);
      } catch (err) {
        return sendJSON(res, 400, { error: err.message });
      }
    }

    // Fallback 404
    return sendJSON(res, 404, { error: 'Route not found' });
  } catch (err) {
    console.error('Server error:', err);
    return sendJSON(res, 500, { error: 'Internal Server Error', message: err.message });
  }
});

function startServer(portToUse) {
  server.listen(portToUse, () => {
    console.log(`================================================================`);
    console.log(`🚀 NBFC Portal & Configuration Dashboard running on http://localhost:${portToUse}`);
    console.log(`================================================================`);
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const nextPort = Number(server.address()?.port || PORT) + 1;
    console.log(`Port ${PORT} is occupied by another process, switching to http://localhost:${nextPort}...`);
    startServer(nextPort);
  } else {
    console.error('Server error:', err);
  }
});

startServer(PORT);
