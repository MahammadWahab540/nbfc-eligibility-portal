/**
 * Cloudflare Worker for NBFC Partner Portal
 * Serves Static Frontend Assets & Executes Edge Suggestion Engine APIs
 */

import rulesData from './data/rules.json';
import settingsData from './data/settings.json';
import auditData from './data/audit.json';
import NBFCSuggestionEngine from './engine.js';

// In-memory state at the edge
const parsedRules = rulesData.default || rulesData;
const parsedSettings = settingsData.default || settingsData;
const parsedAudit = auditData.default || auditData;

let currentRuleSet = JSON.parse(JSON.stringify(parsedRules));
let currentSettings = JSON.parse(JSON.stringify(parsedSettings));
let currentAuditLogs = JSON.parse(JSON.stringify(parsedAudit));
const evaluationStore = new Map();

const engine = new NBFCSuggestionEngine({
  ruleSet: currentRuleSet,
  settings: currentSettings
});

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      });
    }

    // -----------------------------------------------------------------------
    // API ROUTING (/api/v1/*)
    // -----------------------------------------------------------------------
    if (pathname.startsWith('/api/v1/')) {
      try {
        // 1. GET /api/v1/partners
        if (pathname === '/api/v1/partners' && method === 'GET') {
          return jsonResponse(currentRuleSet);
        }

        // 2. PUT /api/v1/partners/:id
        const updatePartnerMatch = pathname.match(/^\/api\/v1\/partners\/([^\/]+)$/);
        if (updatePartnerMatch && method === 'PUT') {
          const partnerId = updatePartnerMatch[1];
          const body = await request.json().catch(() => ({}));
          const partner = currentRuleSet.partners.find(p => p.id === partnerId);
          if (!partner) return jsonResponse({ error: 'Partner not found' }, 404);

          if (body.criteria) partner.criteria = { ...partner.criteria, ...body.criteria };
          if (body.name) partner.name = body.name;
          if (body.description) partner.description = body.description;

          currentAuditLogs.unshift({
            timestamp: new Date().toISOString(),
            user: body.user || 'Business User',
            action: 'UPDATE_CRITERIA',
            entity: partner.name,
            description: `Updated guidelines for ${partner.name}`,
            version: currentRuleSet.version
          });

          return jsonResponse({ success: true, partner });
        }

        // 3. PATCH /api/v1/partners/:id/status
        const statusMatch = pathname.match(/^\/api\/v1\/partners\/([^\/]+)\/status$/);
        if (statusMatch && method === 'PATCH') {
          const partnerId = statusMatch[1];
          const body = await request.json().catch(() => ({}));
          const partner = currentRuleSet.partners.find(p => p.id === partnerId);
          if (!partner) return jsonResponse({ error: 'Partner not found' }, 404);

          partner.is_active = Boolean(body.is_active);

          currentAuditLogs.unshift({
            timestamp: new Date().toISOString(),
            user: body.user || 'Business User',
            action: partner.is_active ? 'RESUME_PARTNER' : 'PAUSE_PARTNER',
            entity: partner.name,
            description: `${partner.is_active ? 'Resumed' : 'Paused'} partner ${partner.name}`,
            version: currentRuleSet.version
          });

          return jsonResponse({ success: true, partner });
        }

        // 4. POST /api/v1/partners/reorder
        if (pathname === '/api/v1/partners/reorder' && method === 'POST') {
          const body = await request.json().catch(() => ({}));
          if (!body.order || !Array.isArray(body.order)) {
            return jsonResponse({ error: 'Missing order array' }, 400);
          }

          body.order.forEach((id, idx) => {
            const p = currentRuleSet.partners.find(x => x.id === id);
            if (p) p.priority = idx + 1;
          });
          currentRuleSet.partners.sort((a, b) => (a.priority || 99) - (b.priority || 99));

          currentAuditLogs.unshift({
            timestamp: new Date().toISOString(),
            user: body.user || 'Business User',
            action: 'REORDER_PRIORITY',
            entity: 'PARTNER_LIST',
            description: `Reordered lender priority sequence`,
            version: currentRuleSet.version
          });

          return jsonResponse({ success: true, partners: currentRuleSet.partners });
        }

        // 5. GET /api/v1/settings & PUT /api/v1/settings
        if (pathname === '/api/v1/settings') {
          if (method === 'GET') {
            return jsonResponse(currentSettings);
          }
          if (method === 'PUT') {
            const body = await request.json().catch(() => ({}));
            currentSettings = { ...currentSettings, ...body };
            engine.settings = currentSettings;
            return jsonResponse({ success: true, settings: currentSettings });
          }
        }

        // 6. GET /api/v1/audit
        if (pathname === '/api/v1/audit' && method === 'GET') {
          return jsonResponse(currentAuditLogs);
        }

        // 7. POST /api/v1/eligibility/evaluate
        if (pathname === '/api/v1/eligibility/evaluate' && method === 'POST') {
          const body = await request.json().catch(() => ({}));
          engine.ruleSet = currentRuleSet;
          engine.settings = currentSettings;
          const result = engine.evaluate(body, body.parameter_questions);
          evaluationStore.set(result.evaluation_id, result);
          return jsonResponse(result);
        }

        // 8. POST /api/v1/eligibility/select
        if (pathname === '/api/v1/eligibility/select' && method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const { evaluation_id, selected_partner_id, user_id } = body;
          const evaluation = evaluationStore.get(evaluation_id);
          const partner = currentRuleSet.partners.find(p => p.id === selected_partner_id);

          return jsonResponse({
            success: true,
            message: `Selected ${partner ? partner.name : selected_partner_id} for applicant`,
            salesforce_synced: true,
            timestamp: new Date().toISOString()
          });
        }

        return jsonResponse({ error: 'Endpoint not found' }, 404);
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    // -----------------------------------------------------------------------
    // STATIC ASSETS (HTML, CSS, JS from ./public)
    // -----------------------------------------------------------------------
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  }
};
