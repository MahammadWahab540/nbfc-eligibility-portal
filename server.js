/**
 * Complete Full-Stack Backend Server for NBFC Portal
 * Serves REST APIs and Static Configuration Dashboard UI
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const NBFCSuggestionEngine = require('./engine');

const engine = new NBFCSuggestionEngine({ dataPath: path.join(__dirname, 'data') });
const PORT = process.env.PORT || 3000;

// In-memory evaluation cache
const evaluationStore = new Map();
const evaluationHistory = [];

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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Global CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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
    }

    // -------------------------------------------------------------
    // API: SYSTEM HEALTH
    // -------------------------------------------------------------
    if (req.method === 'GET' && pathname === '/health') {
      return sendJSON(res, 200, {
        status: 'HEALTHY',
        version: engine.ruleSet.version,
        active_partners: engine.ruleSet.partners.filter(p => p.is_active).length,
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
    // API: UPDATE SINGLE PARTNER CRITERIA
    // -------------------------------------------------------------
    if (req.method === 'PUT' && pathname.match(/^\/api\/v1\/partners\/([^/]+)$/)) {
      const partnerId = pathname.split('/').pop().toLowerCase();
      const body = await parseBody(req);
      engine.loadData();

      const partner = engine.ruleSet.partners.find(p => p.id === partnerId);
      if (!partner) {
        return sendJSON(res, 404, { error: 'Partner not found' });
      }

      // Update fields
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

      // Bump minor version
      const vParts = (engine.ruleSet.version || '1.0.0').split('.');
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
      const body = await parseBody(req); // expects { order: ['gyandhan', 'fibe', ...] }
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
      const body = await parseBody(req);
      const settingsPath = path.join(engine.dataPath, 'settings.json');
      const updated = { ...engine.settings, ...body };
      fs.writeFileSync(settingsPath, JSON.stringify(updated, null, 2), 'utf8');
      engine.settings = updated;
      engine.recordAudit(body.user || 'Risk Operations Manager', 'UPDATE_SETTINGS', 'SYSTEM_PREFERENCES', 'Adjusted execution preferences');
      return sendJSON(res, 200, { message: 'Settings saved', settings: updated });
    }

    // -------------------------------------------------------------
    // API: GET AUDIT LOGS
    // -------------------------------------------------------------
    if (req.method === 'GET' && pathname === '/api/v1/audit') {
      const auditPath = path.join(engine.dataPath, 'audit.json');
      let logs = [];
      try {
        logs = JSON.parse(fs.readFileSync(auditPath, 'utf8') || '[]');
      } catch (e) {
        logs = [];
      }
      return sendJSON(res, 200, { total: logs.length, logs });
    }

    // -------------------------------------------------------------
    // API: EVALUATE KYC PAYLOAD
    // -------------------------------------------------------------
    if (req.method === 'POST' && pathname === '/api/v1/eligibility/evaluate') {
      const body = await parseBody(req);
      const parameterQuestions = body.parameter_questions || {};

      const result = engine.evaluate(body, parameterQuestions);

      // Store in memory & history
      evaluationStore.set(result.evaluation_id, {
        eligible_partners: result.eligible_nbfcs.map(n => (n.partner_id || n.nbfc_code).toLowerCase()),
        evaluated_at: result.timestamp,
        applicant: result.applicant_summary
      });

      evaluationHistory.unshift({
        evaluation_id: result.evaluation_id,
        timestamp: result.timestamp,
        applicant_name: body.co_applicant_details?.name || 'Applicant',
        income: body.employment_details?.monthly_income,
        relation: body.co_applicant_details?.relation,
        eligible_count: result.overall_summary.preliminarily_eligible_count,
        top_suggestion: result.recommendation?.recommended_nbfc || 'None'
      });

      if (evaluationHistory.length > 50) evaluationHistory.pop();

      return sendJSON(res, 200, result);
    }

    // -------------------------------------------------------------
    // API: EVALUATION HISTORY
    // -------------------------------------------------------------
    if (req.method === 'GET' && pathname === '/api/v1/evaluations/history') {
      return sendJSON(res, 200, { history: evaluationHistory });
    }

    // -------------------------------------------------------------
    // API: SELECTION CALLBACK
    // -------------------------------------------------------------
    if (req.method === 'POST' && pathname.match(/^\/api\/v1\/eligibility\/([^/]+)\/select$/)) {
      const evaluationId = pathname.split('/')[4];
      const body = await parseBody(req);
      const selectedId = (body.selected_nbfc_id || '').toLowerCase();

      const session = evaluationStore.get(evaluationId);
      if (!session) {
        return sendJSON(res, 404, {
          error: 'Evaluation session not found or expired',
          code: 'SESSION_EXPIRED'
        });
      }

      if (!session.eligible_partners.includes(selectedId)) {
        return sendJSON(res, 400, {
          error: 'Invalid selection',
          code: 'UNQUALIFIED_SELECTION',
          message: `NBFC '${selectedId}' was not eligible for this applicant`
        });
      }

      // In real scenario, fire webhook to Salesforce
      const syncResult = {
        status: 'SYNCED',
        salesforce_lead_id: body.lead_id || '00Q5g00000abc123',
        selected_nbfc: selectedId,
        synced_at: new Date().toISOString()
      };

      return sendJSON(res, 200, {
        status: 'SUCCESS',
        evaluation_id: evaluationId,
        selected_nbfc_id: selectedId,
        salesforce_sync: syncResult
      });
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
