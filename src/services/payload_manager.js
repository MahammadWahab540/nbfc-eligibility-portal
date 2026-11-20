/**
 * Business-Configurable Payload Management System
 * Version 1.0.0
 * 
 * Supports:
 * - Teams: Retargeting, Onboarding, Retention
 * - Programs: Genies, Smart, Edge
 * - Team-level base fields with Program-level inheritance & overrides
 * - Dynamic field addition, editing, disabling, deletion, and priority sorting
 * - Payload validation engine (types, mandatory checks, min/max bounds, regex, dropdowns)
 * - Draft & Publish lifecycle with version history and 1-click rollback
 * - Impact visibility and comprehensive audit logging
 */

const fs = require('fs');
const path = require('path');
const { getDatabaseRepository } = require('../db/database');

// Supported Business Teams
const TEAMS = {
  onboarding: { id: 'onboarding', name: 'Onboarding Team', description: 'Primary student onboarding, loan application & KYC processing' },
  retargeting: { id: 'retargeting', name: 'Retargeting Team', description: 'Re-engagement of dropped, stalled or paused applicant leads' },
  retention: { id: 'retention', name: 'Retention Team', description: 'Existing student journey, loan restructuring & upskilling retention' }
};

// Supported Academic Programs
const PROGRAMS = {
  genies: { id: 'genies', name: 'Genies', description: 'Elite tech & career accelerator cohort (Elite Program)' },
  smart: { id: 'smart', name: 'Smart', description: 'Intensive full-stack software & data engineering academy (Standard Tier)' },
  edge: { id: 'edge', name: 'Edge', description: 'Foundational career accelerator track (Entry Level)' }
};

// Field Priority Levels
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

// Supported Field Types
const FIELD_TYPES = [
  'text',
  'number',
  'currency',
  'boolean',
  'date',
  'dropdown',
  'email',
  'phone'
];

class PayloadManagerService {
  constructor(options = {}) {
    this.dataPath = options.dataPath || path.join(__dirname, '..', '..', 'data');
    this.configFilePath = path.join(this.dataPath, 'payload_configs.json');
    this.db = options.db || getDatabaseRepository();
    this.configs = null;
    this.loadConfigs();
  }

  /**
   * Loads configurations from JSON file and initializes defaults if missing
   */
  loadConfigs() {
    try {
      if (fs.existsSync(this.configFilePath)) {
        const raw = fs.readFileSync(this.configFilePath, 'utf8');
        this.configs = JSON.parse(raw);
      } else {
        this.configs = this._getDefaultConfigurations();
        this.saveConfigsToFile();
      }
    } catch (e) {
      console.warn('[PAYLOAD_MANAGER] Failed to load config file, initializing defaults:', e.message);
      this.configs = this._getDefaultConfigurations();
    }
  }

  saveConfigsToFile() {
    try {
      fs.writeFileSync(this.configFilePath, JSON.stringify(this.configs, null, 2), 'utf8');
    } catch (e) {
      console.error('[PAYLOAD_MANAGER] Failed to write configs to file:', e.message);
    }
  }

  /**
   * Returns list of available teams and programs with metadata
   */
  getTeamsAndPrograms() {
    return {
      teams: Object.values(TEAMS),
      programs: Object.values(PROGRAMS),
      field_types: FIELD_TYPES,
      priorities: PRIORITIES
    };
  }

  /**
   * Resolves the effective configuration for a Team × Program pair by merging:
   * Team Base Fields + Program Overrides + Program Specific Fields.
   */
  getResolvedConfiguration(teamId, programId) {
    this.loadConfigs();
    const tKey = String(teamId).toLowerCase();
    const pKey = String(programId).toLowerCase();

    if (!TEAMS[tKey]) throw new Error(`Unknown team: '${teamId}'`);
    if (!PROGRAMS[pKey]) throw new Error(`Unknown program: '${programId}'`);

    const teamData = this.configs.teams[tKey] || { base_fields: [], programs: {} };
    const baseFields = teamData.base_fields || [];
    const programData = (teamData.programs && teamData.programs[pKey]) || {
      version: '1.0.0',
      status: 'ACTIVE',
      published_at: new Date().toISOString(),
      published_by: 'System Administrator',
      program_fields: [],
      overrides: {},
      draft: null
    };

    // 1. Process base fields with program overrides
    const resolvedFields = [];
    const overrides = programData.overrides || {};

    for (const baseField of baseFields) {
      const override = overrides[baseField.key];
      if (override) {
        // Apply override
        resolvedFields.push({
          ...baseField,
          ...override,
          inherited_from: 'team_base',
          is_overridden: true,
          original_base: { ...baseField }
        });
      } else {
        resolvedFields.push({
          ...baseField,
          inherited_from: 'team_base',
          is_overridden: false
        });
      }
    }

    // 2. Append program-specific fields
    const programFields = programData.program_fields || [];
    for (const pField of programFields) {
      resolvedFields.push({
        ...pField,
        inherited_from: 'program_specific',
        is_overridden: false
      });
    }

    // 3. Sort by priority and order index
    const priorityWeight = { Critical: 1, High: 2, Medium: 3, Low: 4 };
    resolvedFields.sort((a, b) => {
      const orderA = a.order !== undefined ? a.order : 99;
      const orderB = b.order !== undefined ? b.order : 99;
      if (orderA !== orderB) return orderA - orderB;
      const wA = priorityWeight[a.priority] || 3;
      const wB = priorityWeight[b.priority] || 3;
      return wA - wB;
    });

    const hasDraft = Boolean(programData.draft);

    return {
      team: TEAMS[tKey],
      program: PROGRAMS[pKey],
      version: programData.version || '1.0.0',
      status: programData.status || 'ACTIVE',
      published_at: programData.published_at,
      published_by: programData.published_by,
      change_summary: programData.change_summary || 'Initial published configuration',
      has_unpublished_draft: hasDraft,
      draft_summary: hasDraft ? programData.draft.summary : null,
      draft_updated_at: hasDraft ? programData.draft.updated_at : null,
      draft_updated_by: hasDraft ? programData.draft.updated_by : null,
      fields: resolvedFields,
      impact_scope: this.calculateImpactScope(tKey, pKey)
    };
  }

  /**
   * Retrieves the current Draft configuration if one exists, or resolves active config.
   */
  getDraftConfiguration(teamId, programId) {
    const active = this.getResolvedConfiguration(teamId, programId);
    const tKey = String(teamId).toLowerCase();
    const pKey = String(programId).toLowerCase();
    const teamData = this.configs.teams[tKey] || {};
    const programData = (teamData.programs && teamData.programs[pKey]) || {};

    if (programData.draft && programData.draft.fields) {
      return {
        ...active,
        is_draft: true,
        fields: programData.draft.fields,
        draft_metadata: {
          updated_at: programData.draft.updated_at,
          updated_by: programData.draft.updated_by,
          summary: programData.draft.summary
        }
      };
    }

    return {
      ...active,
      is_draft: false
    };
  }

  /**
   * Saves a draft configuration for a Team × Program pair without publishing live
   */
  saveDraft(teamId, programId, draftFields, user = 'Business Operations User', summary = 'Draft updates') {
    const tKey = String(teamId).toLowerCase();
    const pKey = String(programId).toLowerCase();

    if (!TEAMS[tKey]) throw new Error(`Unknown team: '${teamId}'`);
    if (!PROGRAMS[pKey]) throw new Error(`Unknown program: '${programId}'`);

    this.loadConfigs();
    if (!this.configs.teams[tKey]) this.configs.teams[tKey] = { base_fields: [], programs: {} };
    if (!this.configs.teams[tKey].programs) this.configs.teams[tKey].programs = {};
    if (!this.configs.teams[tKey].programs[pKey]) {
      this.configs.teams[tKey].programs[pKey] = {
        version: '1.0.0',
        status: 'ACTIVE',
        published_at: new Date().toISOString(),
        published_by: 'System Administrator',
        program_fields: [],
        overrides: {}
      };
    }

    const prog = this.configs.teams[tKey].programs[pKey];
    prog.draft = {
      fields: draftFields,
      updated_at: new Date().toISOString(),
      updated_by: user,
      summary: summary
    };

    this.saveConfigsToFile();
    this.db.recordAudit(user, 'SAVE_DRAFT_PAYLOAD_CONFIG', `${tKey.toUpperCase()}_${pKey.toUpperCase()}`, summary, prog.version);

    return {
      success: true,
      message: `Draft saved successfully for ${TEAMS[tKey].name} → ${PROGRAMS[pKey].name}`,
      team: tKey,
      program: pKey,
      draft_updated_at: prog.draft.updated_at
    };
  }

  /**
   * Publishes the current draft (or specified fields) to Live, incrementing version
   */
  publishConfiguration(teamId, programId, user = 'Business Administrator', changeSummary = 'Published updated payload criteria') {
    const tKey = String(teamId).toLowerCase();
    const pKey = String(programId).toLowerCase();

    if (!TEAMS[tKey]) throw new Error(`Unknown team: '${teamId}'`);
    if (!PROGRAMS[pKey]) throw new Error(`Unknown program: '${programId}'`);

    this.loadConfigs();
    const teamData = this.configs.teams[tKey];
    const prog = teamData.programs[pKey];

    if (!prog.draft || !prog.draft.fields) {
      throw new Error(`No draft changes found to publish for ${TEAMS[tKey].name} → ${PROGRAMS[pKey].name}`);
    }

    // 1. Calculate new version (e.g. 1.0.0 -> 1.1.0)
    const oldVersion = prog.version || '1.0.0';
    const vParts = oldVersion.split('.');
    vParts[1] = parseInt(vParts[1] || '0', 10) + 1;
    vParts[2] = 0;
    const newVersion = vParts.join('.');

    // 2. Separate draft fields into overrides and program-specific fields
    const baseFieldKeys = new Set((teamData.base_fields || []).map(b => b.key));
    const newOverrides = {};
    const newProgramFields = [];

    for (let idx = 0; idx < prog.draft.fields.length; idx++) {
      const f = prog.draft.fields[idx];
      f.order = idx + 1;

      if (baseFieldKeys.has(f.key)) {
        // Check if different from base
        const origBase = teamData.base_fields.find(b => b.key === f.key);
        const hasDiff =
          f.required !== origBase.required ||
          f.enabled !== origBase.enabled ||
          f.priority !== origBase.priority ||
          f.default_value !== origBase.default_value ||
          f.label !== origBase.label ||
          JSON.stringify(f.validation || {}) !== JSON.stringify(origBase.validation || {});

        if (hasDiff) {
          newOverrides[f.key] = {
            required: f.required,
            enabled: f.enabled,
            priority: f.priority,
            default_value: f.default_value,
            label: f.label,
            validation: f.validation,
            order: f.order
          };
        }
      } else {
        newProgramFields.push(f);
      }
    }

    // 3. Save snapshot in history table before updating
    if (!prog.history) prog.history = [];
    prog.history.unshift({
      version: oldVersion,
      published_at: prog.published_at || new Date().toISOString(),
      published_by: prog.published_by || 'Administrator',
      change_summary: prog.change_summary || 'Previous active release',
      overrides: prog.overrides,
      program_fields: prog.program_fields
    });

    // Keep top 20 historical versions
    if (prog.history.length > 20) prog.history = prog.history.slice(0, 20);

    // 4. Activate new version
    prog.version = newVersion;
    prog.published_at = new Date().toISOString();
    prog.published_by = user;
    prog.change_summary = changeSummary;
    prog.overrides = newOverrides;
    prog.program_fields = newProgramFields;
    prog.draft = null; // Clear draft

    this.saveConfigsToFile();

    // 5. Record in SQLite audit log and lifecycle table
    this.db.recordAudit(user, 'PUBLISH_PAYLOAD_CONFIG', `${tKey.toUpperCase()}_${pKey.toUpperCase()}`, `${changeSummary} (Upgraded to v${newVersion})`, newVersion);

    return {
      success: true,
      message: `Configuration published to v${newVersion} for ${TEAMS[tKey].name} → ${PROGRAMS[pKey].name}`,
      team: tKey,
      program: pKey,
      version: newVersion,
      published_at: prog.published_at,
      published_by: user,
      resolved: this.getResolvedConfiguration(tKey, pKey)
    };
  }

  /**
   * Rolls back a Team × Program configuration to a historical version
   */
  rollbackVersion(teamId, programId, targetVersion, user = 'Administrator') {
    const tKey = String(teamId).toLowerCase();
    const pKey = String(programId).toLowerCase();

    this.loadConfigs();
    const teamData = this.configs.teams[tKey];
    const prog = teamData.programs[pKey];

    if (!prog.history || prog.history.length === 0) {
      throw new Error(`No rollback history available for ${tKey} → ${pKey}`);
    }

    const historical = prog.history.find(h => h.version === targetVersion);
    if (!historical) {
      throw new Error(`Target version '${targetVersion}' not found in rollback history.`);
    }

    // Save current version to history
    prog.history.unshift({
      version: prog.version,
      published_at: prog.published_at,
      published_by: prog.published_by,
      change_summary: `Pre-rollback snapshot before rolling back to ${targetVersion}`,
      overrides: prog.overrides,
      program_fields: prog.program_fields
    });

    // Revert
    prog.version = targetVersion;
    prog.published_at = new Date().toISOString();
    prog.published_by = user;
    prog.change_summary = `Rollback to version ${targetVersion}`;
    prog.overrides = historical.overrides || {};
    prog.program_fields = historical.program_fields || [];
    prog.draft = null;

    this.saveConfigsToFile();
    this.db.recordAudit(user, 'ROLLBACK_PAYLOAD_CONFIG', `${tKey.toUpperCase()}_${pKey.toUpperCase()}`, `Reverted to version ${targetVersion}`, targetVersion);

    return {
      success: true,
      message: `Successfully rolled back ${TEAMS[tKey].name} → ${PROGRAMS[pKey].name} to version ${targetVersion}`,
      team: tKey,
      program: pKey,
      version: targetVersion
    };
  }

  /**
   * Returns version history and audit log for a Team × Program
   */
  getVersionHistory(teamId, programId) {
    const tKey = String(teamId).toLowerCase();
    const pKey = String(programId).toLowerCase();
    this.loadConfigs();

    const prog = this.configs.teams[tKey]?.programs[pKey] || {};
    const history = prog.history || [];

    const current = {
      version: prog.version || '1.0.0',
      status: 'ACTIVE (CURRENT)',
      published_at: prog.published_at,
      published_by: prog.published_by,
      change_summary: prog.change_summary || 'Current active configuration'
    };

    return {
      team: TEAMS[tKey],
      program: PROGRAMS[pKey],
      current: current,
      versions: [current, ...history]
    };
  }

  /**
   * Validates an incoming payload against the active Team × Program configuration
   */
  validatePayload(teamId, programId, payload = {}, options = {}) {
    const resolved = options.useDraft
      ? this.getDraftConfiguration(teamId, programId)
      : this.getResolvedConfiguration(teamId, programId);

    const activeFields = resolved.fields.filter(f => f.enabled !== false);

    const missingMandatory = [];
    const typeErrors = [];
    const validationErrors = [];
    const sanitized = {};

    for (const field of activeFields) {
      const key = field.key;
      let rawVal = payload[key];

      // Also check common aliases if key missing
      if (rawVal === undefined || rawVal === null || rawVal === '') {
        if (field.aliases && Array.isArray(field.aliases)) {
          for (const alias of field.aliases) {
            if (payload[alias] !== undefined && payload[alias] !== null && payload[alias] !== '') {
              rawVal = payload[alias];
              break;
            }
          }
        }
      }

      // Check mandatory presence
      if (field.required) {
        if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') {
          missingMandatory.push({
            field_key: key,
            field_label: field.label,
            priority: field.priority,
            error: `Field '${field.label}' (${key}) is mandatory for ${resolved.program.name}`
          });
          continue;
        }
      }

      // If value is absent and optional, apply default value if configured
      if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') {
        if (field.default_value !== undefined && field.default_value !== null && field.default_value !== '') {
          sanitized[key] = field.default_value;
        }
        continue;
      }

      // Type & Constraints Validation
      const valResult = this._validateFieldTypeAndConstraints(field, rawVal);
      if (!valResult.valid) {
        if (valResult.type_error) {
          typeErrors.push({
            field_key: key,
            field_label: field.label,
            expected_type: field.type,
            actual_value: rawVal,
            error: valResult.error
          });
        } else {
          validationErrors.push({
            field_key: key,
            field_label: field.label,
            rule: valResult.rule,
            error: valResult.error
          });
        }
      } else {
        sanitized[key] = valResult.sanitized_value;
      }
    }

    const isValid = missingMandatory.length === 0 && typeErrors.length === 0 && validationErrors.length === 0;

    return {
      valid: isValid,
      team: teamId,
      program: programId,
      version: resolved.version,
      total_fields_evaluated: activeFields.length,
      missing_mandatory_fields: missingMandatory,
      type_errors: typeErrors,
      validation_errors: validationErrors,
      sanitized_payload: sanitized,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generates a realistic mock sample payload conforming to the configuration
   */
  generateSamplePayload(teamId, programId) {
    const resolved = this.getResolvedConfiguration(teamId, programId);
    const sample = {};

    for (const f of resolved.fields) {
      if (f.enabled === false) continue;
      sample[f.key] = this._generateSampleValue(f);
    }

    return {
      metadata: {
        team: resolved.team.name,
        program: resolved.program.name,
        version: resolved.version,
        generated_at: new Date().toISOString()
      },
      payload: sample
    };
  }

  /**
   * Calculates which integrations and channels are impacted by changes to this Team × Program
   */
  calculateImpactScope(teamId, programId) {
    const impacts = [];

    impacts.push({
      channel: 'Salesforce CRM Lead Journey',
      impact_level: 'HIGH',
      description: `Salesforce ${TEAMS[teamId].name} outbound payloads for ${PROGRAMS[programId].name} must include all mandatory fields.`
    });

    impacts.push({
      channel: 'KYC Document Intake Portal',
      impact_level: 'MEDIUM',
      description: `Form fields and validation rules in the student portal will adapt to these schema requirements.`
    });

    impacts.push({
      channel: 'Centralised NBFC Eligibility Engine',
      impact_level: 'CRITICAL',
      description: `Eligibility prescreening and lender rule evaluators consume these fields for NBFC selection.`
    });

    return impacts;
  }

  // -------------------------------------------------------------
  // Internal Validation Helpers
  // -------------------------------------------------------------

  _validateFieldTypeAndConstraints(field, val) {
    const type = (field.type || 'text').toLowerCase();
    const rules = field.validation || {};
    let sanitizedVal = val;

    switch (type) {
      case 'number': {
        const num = parseFloat(String(val).replace(/,/g, '').trim());
        if (isNaN(num)) {
          return { valid: false, type_error: true, error: `Value '${val}' is not a valid number.` };
        }
        if (rules.min !== undefined && num < rules.min) {
          return { valid: false, rule: 'MIN_LIMIT', error: `Value (${num}) must be at least ${rules.min}.` };
        }
        if (rules.max !== undefined && num > rules.max) {
          return { valid: false, rule: 'MAX_LIMIT', error: `Value (${num}) cannot exceed ${rules.max}.` };
        }
        sanitizedVal = num;
        break;
      }

      case 'currency': {
        const cleaned = String(val).replace(/[₹RsINR\/\-\s,]/gi, '').trim();
        const num = parseFloat(cleaned);
        if (isNaN(num)) {
          return { valid: false, type_error: true, error: `Value '${val}' is not a valid monetary amount.` };
        }
        if (rules.min !== undefined && num < rules.min) {
          return { valid: false, rule: 'MIN_LIMIT', error: `Amount (₹${num}) must be at least ₹${rules.min}.` };
        }
        if (rules.max !== undefined && num > rules.max) {
          return { valid: false, rule: 'MAX_LIMIT', error: `Amount (₹${num}) cannot exceed ₹${rules.max}.` };
        }
        sanitizedVal = num;
        break;
      }

      case 'boolean': {
        if (typeof val === 'boolean') {
          sanitizedVal = val;
        } else {
          const s = String(val).trim().toLowerCase();
          if (['true', 'yes', '1', 'y'].includes(s)) sanitizedVal = true;
          else if (['false', 'no', '0', 'n'].includes(s)) sanitizedVal = false;
          else return { valid: false, type_error: true, error: `Value '${val}' must be a valid boolean (true/false).` };
        }
        break;
      }

      case 'date': {
        const d = new Date(val);
        if (isNaN(d.getTime())) {
          return { valid: false, type_error: true, error: `Value '${val}' is not a valid date format.` };
        }
        sanitizedVal = d.toISOString().split('T')[0];
        break;
      }

      case 'dropdown': {
        const options = field.options || rules.options || [];
        if (options.length > 0) {
          const matched = options.some(opt => String(opt).toLowerCase() === String(val).trim().toLowerCase());
          if (!matched) {
            return {
              valid: false,
              rule: 'DROPDOWN_OPTION',
              error: `Value '${val}' is not one of the allowed options: [${options.join(', ')}].`
            };
          }
        }
        sanitizedVal = String(val).trim();
        break;
      }

      case 'email': {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(String(val).trim())) {
          return { valid: false, type_error: true, error: `Value '${val}' is not a valid email address.` };
        }
        sanitizedVal = String(val).trim().toLowerCase();
        break;
      }

      case 'phone': {
        const digits = String(val).replace(/\D/g, '');
        if (digits.length !== 10) {
          return { valid: false, type_error: true, error: `Phone number '${val}' must be exactly 10 digits.` };
        }
        sanitizedVal = digits;
        break;
      }

      case 'text':
      default: {
        const str = String(val).trim();
        if (rules.min_length !== undefined && str.length < rules.min_length) {
          return { valid: false, rule: 'MIN_LENGTH', error: `Text length (${str.length}) is below required minimum (${rules.min_length}).` };
        }
        if (rules.max_length !== undefined && str.length > rules.max_length) {
          return { valid: false, rule: 'MAX_LENGTH', error: `Text length (${str.length}) exceeds maximum limit (${rules.max_length}).` };
        }
        if (rules.pattern) {
          const regex = new RegExp(rules.pattern);
          if (!regex.test(str)) {
            return { valid: false, rule: 'PATTERN_MISMATCH', error: rules.error_message || `Text does not match required format pattern (${rules.pattern}).` };
          }
        }
        sanitizedVal = str;
        break;
      }
    }

    return { valid: true, sanitized_value: sanitizedVal };
  }

  _generateSampleValue(field) {
    if (field.default_value !== undefined && field.default_value !== null && field.default_value !== '') {
      return field.default_value;
    }

    const type = (field.type || 'text').toLowerCase();
    switch (type) {
      case 'number': return 35;
      case 'currency': return 45000;
      case 'boolean': return true;
      case 'date': return '1998-05-15';
      case 'dropdown': return field.options && field.options.length > 0 ? field.options[0] : 'Sample Option';
      case 'email': return 'applicant@example.com';
      case 'phone': return '9876543210';
      case 'text':
      default:
        return `Sample ${field.label || 'Text'}`;
    }
  }

  /**
   * Comprehensive default configurations covering all 3 Teams × 3 Programs
   */
  _getDefaultConfigurations() {
    return {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      teams: {
        onboarding: {
          id: 'onboarding',
          name: 'Onboarding Team',
          base_fields: [
            {
              id: 'f_user_id',
              key: 'userId',
              label: 'User Applicant ID',
              type: 'text',
              required: true,
              enabled: true,
              priority: 'Critical',
              default_value: '',
              placeholder: 'e.g. 8e40531c-075f-43ec-98ec-4a0457a24ccd',
              help_text: 'Salesforce Lead / Student unique UUID'
            },
            {
              id: 'f_name',
              key: 'Academy PRE -Loan Journey Name',
              label: 'Applicant Name',
              type: 'text',
              required: true,
              enabled: true,
              priority: 'Critical',
              default_value: '',
              placeholder: 'Full legal name as per Aadhaar'
            },
            {
              id: 'f_cibil',
              key: 'CIBIL Score Range',
              label: 'CIBIL Score Bracket',
              type: 'dropdown',
              required: true,
              enabled: true,
              priority: 'Critical',
              options: ['700 - 900', '650 - 699', '300 - 649', 'No CIBIL Score'],
              default_value: '700 - 900',
              help_text: 'Self-reported or preliminary bureau bracket'
            },
            {
              id: 'f_relation',
              key: 'Relation with the Co-Applicant',
              label: 'Co-Applicant Relationship',
              type: 'dropdown',
              required: true,
              enabled: true,
              priority: 'High',
              options: ['Father', 'Mother', 'Spouse', 'Brother', 'Sister', 'Sibling', 'Legal Guardian', 'Other'],
              default_value: 'Father'
            },
            {
              id: 'f_income',
              key: 'Co-Applicant Monthly Income',
              label: 'Co-Applicant Monthly Income',
              type: 'currency',
              required: true,
              enabled: true,
              priority: 'Critical',
              default_value: 30000,
              validation: { min: 15000, max: 1000000 }
            },
            {
              id: 'f_age',
              key: 'Co-Applicant Age',
              label: 'Co-Applicant Age',
              type: 'number',
              required: true,
              enabled: true,
              priority: 'High',
              default_value: 45,
              validation: { min: 18, max: 70 }
            },
            {
              id: 'f_bank',
              key: "Co-Applicant's Bank Name",
              label: 'Salary / Primary Bank Name',
              type: 'text',
              required: true,
              enabled: true,
              priority: 'High',
              default_value: 'HDFC',
              placeholder: 'Bank IFSC / Code / Name'
            },
            {
              id: 'f_state',
              key: 'State',
              label: 'Resident State',
              type: 'text',
              required: true,
              enabled: true,
              priority: 'Medium',
              default_value: 'Karnataka'
            },
            {
              id: 'f_pan_aadhaar',
              key: 'is_pan_aadhaar_linked',
              label: 'PAN-Aadhaar Linked',
              type: 'boolean',
              required: false,
              enabled: true,
              priority: 'Medium',
              default_value: true
            }
          ],
          programs: {
            genies: {
              version: '1.0.0',
              status: 'ACTIVE',
              published_at: new Date().toISOString(),
              published_by: 'System Administrator',
              change_summary: 'Standard onboarding schema for Genies cohort',
              overrides: {
                // Genies is flexible: income floor ₹15,000, age limit relaxed
                'Co-Applicant Monthly Income': {
                  required: true,
                  default_value: 20000,
                  validation: { min: 15000, max: 500000 }
                }
              },
              program_fields: [
                {
                  id: 'f_genies_device',
                  key: 'has_laptop_and_wifi',
                  label: 'Has Personal Laptop & Internet',
                  type: 'boolean',
                  required: true,
                  enabled: true,
                  priority: 'High',
                  default_value: true,
                  help_text: 'Prerequisite for remote learning in Genies'
                }
              ]
            },
            smart: {
              version: '1.0.0',
              status: 'ACTIVE',
              published_at: new Date().toISOString(),
              published_by: 'System Administrator',
              change_summary: 'Standard Tier-1 onboarding schema for Smart Academy',
              overrides: {
                'Co-Applicant Monthly Income': {
                  required: true,
                  default_value: 25000,
                  validation: { min: 20000, max: 800000 }
                }
              },
              program_fields: [
                {
                  id: 'f_smart_degree',
                  key: 'highest_education_qualification',
                  label: 'Highest Degree Qualification',
                  type: 'dropdown',
                  required: true,
                  enabled: true,
                  priority: 'Medium',
                  options: ['B.Tech / B.E', 'BCA / MCA', 'B.Sc / M.Sc', 'Diploma', 'Other Graduate'],
                  default_value: 'B.Tech / B.E'
                }
              ]
            },
            edge: {
              version: '1.0.0',
              status: 'ACTIVE',
              published_at: new Date().toISOString(),
              published_by: 'System Administrator',
              change_summary: 'High-bar placement track schema for Edge',
              overrides: {
                // Edge has strict mandatory requirements
                'Co-Applicant Monthly Income': {
                  required: true,
                  default_value: 35000,
                  priority: 'Critical',
                  validation: { min: 25000, max: 1000000 }
                },
                'is_pan_aadhaar_linked': {
                  required: true, // Made mandatory for Edge
                  priority: 'High'
                }
              },
              program_fields: [
                {
                  id: 'f_edge_placement_agreement',
                  key: 'placement_agreement_acknowledged',
                  label: 'Placement Guarantee Agreement Signed',
                  type: 'boolean',
                  required: true,
                  enabled: true,
                  priority: 'Critical',
                  default_value: true
                },
                {
                  id: 'f_edge_coding_score',
                  key: 'entrance_coding_assessment_score',
                  label: 'Entrance Coding Assessment Score',
                  type: 'number',
                  required: true,
                  enabled: true,
                  priority: 'High',
                  default_value: 80,
                  validation: { min: 60, max: 100 }
                }
              ]
            }
          }
        },

        retargeting: {
          id: 'retargeting',
          name: 'Retargeting Team',
          base_fields: [
            {
              id: 'f_retarget_lead_id',
              key: 'lead_id',
              label: 'Salesforce Lead ID',
              type: 'text',
              required: true,
              enabled: true,
              priority: 'Critical'
            },
            {
              id: 'f_retarget_applicant_name',
              key: 'applicant_name',
              label: 'Applicant Full Name',
              type: 'text',
              required: true,
              enabled: true,
              priority: 'High'
            },
            {
              id: 'f_retarget_drop_stage',
              key: 'drop_off_stage',
              label: 'Previous Drop-Off Stage',
              type: 'dropdown',
              required: true,
              enabled: true,
              priority: 'Critical',
              options: ['KYC Pending', 'Bank Statement Review', 'VKYC Incomplete', 'Lender Rejected', 'Financial Hardship'],
              default_value: 'Bank Statement Review'
            },
            {
              id: 'f_retarget_discount_code',
              key: 're_engagement_scholarship_coupon',
              label: 'Scholarship / Discount Code',
              type: 'text',
              required: false,
              enabled: true,
              priority: 'Medium',
              default_value: 'RESTART20'
            },
            {
              id: 'f_retarget_callback_time',
              key: 'preferred_callback_slot',
              label: 'Preferred Counselor Callback Slot',
              type: 'dropdown',
              required: true,
              enabled: true,
              priority: 'High',
              options: ['Morning (10 AM - 1 PM)', 'Afternoon (1 PM - 4 PM)', 'Evening (4 PM - 8 PM)', 'Weekend'],
              default_value: 'Evening (4 PM - 8 PM)'
            }
          ],
          programs: {
            genies: {
              version: '1.0.0',
              status: 'ACTIVE',
              published_at: new Date().toISOString(),
              published_by: 'System Administrator',
              change_summary: 'Retargeting configuration for Genies',
              overrides: {},
              program_fields: [
                {
                  id: 'f_retarget_genies_emi',
                  key: 'subsidized_zero_interest_requested',
                  label: 'Requested Subsidized Zero-Interest Plan',
                  type: 'boolean',
                  required: true,
                  enabled: true,
                  priority: 'High',
                  default_value: true
                }
              ]
            },
            smart: {
              version: '1.0.0',
              status: 'ACTIVE',
              published_at: new Date().toISOString(),
              published_by: 'System Administrator',
              change_summary: 'Retargeting configuration for Smart Academy',
              overrides: {},
              program_fields: []
            },
            edge: {
              version: '1.0.0',
              status: 'ACTIVE',
              published_at: new Date().toISOString(),
              published_by: 'System Administrator',
              change_summary: 'Retargeting configuration for Edge',
              overrides: {},
              program_fields: [
                {
                  id: 'f_retarget_edge_tech_interview',
                  key: 'wants_technical_interview_prep',
                  label: 'Needs Technical Re-Interview',
                  type: 'boolean',
                  required: true,
                  enabled: true,
                  priority: 'High',
                  default_value: true
                }
              ]
            }
          }
        },

        retention: {
          id: 'retention',
          name: 'Retention Team',
          base_fields: [
            {
              id: 'f_retention_student_id',
              key: 'student_enrollment_id',
              label: 'Student Enrollment ID',
              type: 'text',
              required: true,
              enabled: true,
              priority: 'Critical'
            },
            {
              id: 'f_retention_current_cohort',
              key: 'current_cohort_month',
              label: 'Enrolled Cohort Month',
              type: 'text',
              required: true,
              enabled: true,
              priority: 'High',
              default_value: 'Batch-Nov-2026'
            },
            {
              id: 'f_retention_attendance',
              key: 'attendance_percentage',
              label: 'Live Lecture Attendance %',
              type: 'number',
              required: true,
              enabled: true,
              priority: 'High',
              default_value: 85,
              validation: { min: 0, max: 100 }
            },
            {
              id: 'f_retention_nbfc',
              key: 'active_nbfc_partner',
              label: 'Active Disbursed NBFC Partner',
              type: 'dropdown',
              required: true,
              enabled: true,
              priority: 'Critical',
              options: ['Northern Arc', 'Bajaj Finserv', 'Auxilo', 'Fibe', 'Gyandhan', 'Techfino', 'Jodo Flex'],
              default_value: 'Northern Arc'
            },
            {
              id: 'f_retention_restructure',
              key: 'is_tenure_restructure_requested',
              label: 'Tenure Restructure / Pause Requested',
              type: 'boolean',
              required: false,
              enabled: true,
              priority: 'Medium',
              default_value: false
            }
          ],
          programs: {
            genies: {
              version: '1.0.0',
              status: 'ACTIVE',
              published_at: new Date().toISOString(),
              published_by: 'System Administrator',
              change_summary: 'Retention schema for Genies cohort',
              overrides: {},
              program_fields: []
            },
            smart: {
              version: '1.0.0',
              status: 'ACTIVE',
              published_at: new Date().toISOString(),
              published_by: 'System Administrator',
              change_summary: 'Retention schema for Smart Academy',
              overrides: {},
              program_fields: [
                {
                  id: 'f_retention_project_status',
                  key: 'capstone_project_submitted',
                  label: 'Capstone Project Milestone Cleared',
                  type: 'boolean',
                  required: true,
                  enabled: true,
                  priority: 'High',
                  default_value: true
                }
              ]
            },
            edge: {
              version: '1.0.0',
              status: 'ACTIVE',
              published_at: new Date().toISOString(),
              published_by: 'System Administrator',
              change_summary: 'Retention schema for Edge Guarantee Track',
              overrides: {
                'attendance_percentage': {
                  required: true,
                  default_value: 95,
                  validation: { min: 90, max: 100 } // Edge requires 90%+ attendance
                }
              },
              program_fields: [
                {
                  id: 'f_retention_mock_interview_score',
                  key: 'mock_interview_rating',
                  label: 'Mock Interview Clearance Rating',
                  type: 'dropdown',
                  required: true,
                  enabled: true,
                  priority: 'Critical',
                  options: ['Top 10% (Hire Ready)', 'Ready (Minor Polish)', 'Needs Retake', 'At Risk'],
                  default_value: 'Top 10% (Hire Ready)'
                }
              ]
            }
          }
        }
      }
    };
  }
}

// Singleton helper
let defaultPayloadManager = null;
function getPayloadManagerService(options) {
  if (!defaultPayloadManager || options) {
    defaultPayloadManager = new PayloadManagerService(options);
  }
  return defaultPayloadManager;
}

module.exports = {
  PayloadManagerService,
  getPayloadManagerService,
  TEAMS,
  PROGRAMS,
  PRIORITIES,
  FIELD_TYPES
};
