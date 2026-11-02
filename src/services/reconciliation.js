/**
 * Centralised NBFC Eligibility & Production Outcome Reconciliation Service
 * Version: 2.2.0
 * 
 * Provides automated reconciliation between historical production outcomes
 * (e.g., Salesforce NBFC Onboarding data) and engine eligibility decisions.
 */

const fs = require('fs');
const path = require('path');
const NBFCEligibilityEngine = require('../engine');

// Canonical lender normalizer
function normalizeLenderCode(rawName) {
  if (!rawName) return null;
  const s = String(rawName).trim().toUpperCase();
  if (s.includes('GYANDHAN')) return 'gyandhan';
  if (s.includes('BAJAJ')) return 'bajaj';
  if (s.includes('AUXILO')) return 'auxilo';
  if (s.includes('FIBE') || s.includes('EARLYSALARY')) return 'fibe';
  if (s.includes('NORTHERN') || s.includes('NARC')) return 'northern_arc';
  if (s.includes('TECHFINO')) return 'techfino';
  if (s.includes('FEEMONK')) return 'feemonk';
  if (s.includes('JODO')) return 'jodo_flex';
  if (s.includes('SHOPSE')) return 'shopse';
  if (s.includes('PINELABS')) return 'pinelabs';
  return s.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

// Canonical display names for standard 6 lenders
const LENDER_DISPLAY_NAMES = {
  northern_arc: 'Northern Arc',
  bajaj: 'Bajaj Finserv',
  auxilo: 'Auxilo',
  fibe: 'Fibe',
  gyandhan: 'Gyandhan',
  techfino: 'Techfino'
};

const STANDARD_6_LENDERS = Object.keys(LENDER_DISPLAY_NAMES);

// CSV parser supporting quoted strings with commas and newlines
function parseCSV(content) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentField);
      if (currentRow.length > 1 || currentRow[0] !== '') {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  return rows;
}

class NBFCReconciliationService {
  constructor(options = {}) {
    this.engine = options.engine || new NBFCEligibilityEngine();
  }

  /**
   * Reconciles production outcome records against the eligibility engine.
   * 
   * @param {Array<Object>} records - Array of applicant objects or flat CSV objects
   * @param {Object} options - Options controlling evaluation and matching
   * @returns {Object} Comprehensive reconciliation ledger and accuracy metrics
   */
  reconcile(records = [], options = {}) {
    const totalRecords = records.length;
    const uniqueUids = new Set();
    const productionStatusCounts = {};
    const lenderVolume = {};
    const externalLenderBreakdown = {};

    const falseRejections = []; // Contradiction: Disbursed in prod, but Ineligible in algo
    const reverseContradictions = []; // Prod Rejected, but Algo Eligible
    const confirmedMatches = []; // Prod Disbursed & Algo Eligible/Conditional
    const trueNegatives = []; // Prod Rejected & Algo Ineligible
    const externalLenderRecords = []; // Lenders outside standard 6

    const lenderAccuracy = {};
    STANDARD_6_LENDERS.forEach(l => {
      lenderAccuracy[l] = {
        total_evaluations: 0,
        prod_disbursed: 0,
        algo_eligible: 0,
        algo_conditional: 0,
        algo_ineligible: 0,
        false_rejections: 0,
        reverse_contradictions: 0
      };
    });

    for (let index = 0; index < records.length; index++) {
      const rec = records[index];
      const rowNum = rec._rowNum || index + 2;

      const uid = rec.userId || rec.userId__c || rec['Academy_Onboarding_PRE__r.userId__c'] || `row_${rowNum}`;
      uniqueUids.add(uid);

      const prodStatus = (rec['NBFC Status'] || rec.status || 'UNKNOWN').trim();
      productionStatusCounts[prodStatus] = (productionStatusCounts[prodStatus] || 0) + 1;

      const rawLender = rec['NBFC Onboarding Name'] || rec['Choose NBFC'] || rec.lender || '';
      const lenderCode = normalizeLenderCode(rawLender);

      if (lenderCode) {
        lenderVolume[lenderCode] = (lenderVolume[lenderCode] || 0) + 1;
      }

      // Check if external lender
      const isStandard6 = STANDARD_6_LENDERS.includes(lenderCode);
      if (!isStandard6 && lenderCode) {
        externalLenderBreakdown[lenderCode] = (externalLenderBreakdown[lenderCode] || 0) + 1;
        externalLenderRecords.push({
          row: rowNum,
          userId: uid,
          name: rec['Academy PRE -Loan Journey Name'] || rec.Name || 'Applicant',
          lender: lenderCode,
          rawLender: rawLender,
          status: prodStatus,
          income: rec['Co-Applicant Monthly Income'] || rec['Co-Applicant Monthly Income Value'] || '',
          cibil: rec['CIBIL Score Range'] || rec.CIBIL_SCORE_RANGE_PRE__c || '',
          state: rec.State || rec.Co_Applicant_state_pre__c || ''
        });
      }

      // Evaluate record through engine if evaluation not already present
      let evaluation = rec._evaluation;
      if (!evaluation) {
        evaluation = this.engine.evaluate(rec);
      }

      // Extract lender decisions from evaluation
      const lenderDecisions = {};
      const allLendersEvaluated = [
        ...(evaluation.eligible_nbfcs || []),
        ...(evaluation.conditional_nbfcs || []),
        ...(evaluation.ineligible_nbfcs || []),
        ...(evaluation.unknown_nbfcs || [])
      ];

      allLendersEvaluated.forEach(d => {
        const code = d.nbfc_code ? d.nbfc_code.toLowerCase() : null;
        if (code) lenderDecisions[code] = d;
      });

      // Update per-lender stats if standard 6
      if (isStandard6 && lenderAccuracy[lenderCode]) {
        const stats = lenderAccuracy[lenderCode];
        stats.total_evaluations++;
        if (prodStatus === 'Disbursed') stats.prod_disbursed++;

        const decision = lenderDecisions[lenderCode];
        if (decision) {
          const status = decision.decision_status || decision.eligibility_status;
          if (status === 'ELIGIBLE') stats.algo_eligible++;
          else if (status === 'CONDITIONAL') stats.algo_conditional++;
          else if (status === 'INELIGIBLE') stats.algo_ineligible++;
        }
      }

      // Reconcile outcomes for standard 6 lenders
      if (isStandard6) {
        const targetDecision = lenderDecisions[lenderCode];
        const algoStatus = targetDecision ? (targetDecision.decision_status || targetDecision.eligibility_status) : 'UNKNOWN';
        const displayName = LENDER_DISPLAY_NAMES[lenderCode] || lenderCode;

        if (prodStatus === 'Disbursed') {
          if (algoStatus === 'INELIGIBLE') {
            // Contradiction: Disbursed but Ineligible
            if (lenderAccuracy[lenderCode]) lenderAccuracy[lenderCode].false_rejections++;
            falseRejections.push({
              row: rowNum,
              userId: uid,
              name: rec['Academy PRE -Loan Journey Name'] || rec.Name || 'Applicant',
              lender: lenderCode,
              displayName: displayName,
              algoStatus: algoStatus,
              reasonCode: targetDecision ? targetDecision.reason_code : 'UNKNOWN',
              reasonDetail: targetDecision ? targetDecision.reason_detail : 'No detail',
              cibil: rec['CIBIL Score Range'] || rec.CIBIL_SCORE_RANGE_PRE__c || '',
              income: rec['Co-Applicant Monthly Income'] || rec['Co-Applicant Monthly Income Value'] || '',
              bank: rec["Co-Applicant's Bank Name"] || rec['Co-Applicant Bank Name'] || rec.Co_Applicant_s_Bank_Name_PRE__c || 'UNSPECIFIED',
              state: rec.State || rec.Co_Applicant_state_pre__c || '',
              occupation: rec['Co applicant Occupation'] || rec.Co_Applicant_Occupation_PRE__c || ''
            });
          } else {
            confirmedMatches.push({
              userId: uid,
              lender: lenderCode,
              algoStatus: algoStatus
            });
          }
        } else if (prodStatus === 'Rejected') {
          if (algoStatus === 'ELIGIBLE') {
            // Reverse Contradiction: Algo Eligible, Prod Rejected
            if (lenderAccuracy[lenderCode]) lenderAccuracy[lenderCode].reverse_contradictions++;
            reverseContradictions.push({
              row: rowNum,
              userId: uid,
              name: rec['Academy PRE -Loan Journey Name'] || rec.Name || 'Applicant',
              lender: lenderCode,
              displayName: displayName,
              algoStatus: algoStatus,
              cibil: rec['CIBIL Score Range'] || rec.CIBIL_SCORE_RANGE_PRE__c || '',
              income: rec['Co-Applicant Monthly Income'] || rec['Co-Applicant Monthly Income Value'] || '',
              bank: rec["Co-Applicant's Bank Name"] || rec['Co-Applicant Bank Name'] || rec.Co_Applicant_s_Bank_Name_PRE__c || 'UNSPECIFIED',
              state: rec.State || rec.Co_Applicant_state_pre__c || '',
              likelyUnderwritingDropStage: 'Stage 4 / Credit Policy: Bank statement AMB / active DPD / cheque bounce / bureau write-off / KYC drop-off'
            });
          } else if (algoStatus === 'INELIGIBLE') {
            trueNegatives.push({
              userId: uid,
              lender: lenderCode
            });
          }
        }
      }
    }

    // Calculate aggregated metrics
    const totalStandard6Evaluations = Object.values(lenderAccuracy).reduce((sum, s) => sum + s.total_evaluations, 0);
    const totalProdDisbursedStandard6 = Object.values(lenderAccuracy).reduce((sum, s) => sum + s.prod_disbursed, 0);

    const falseRejectionRate = totalProdDisbursedStandard6 > 0
      ? ((falseRejections.length / totalProdDisbursedStandard6) * 100).toFixed(2) + '%'
      : '0.00%';

    const reconciliationReport = {
      timestamp: new Date().toISOString(),
      engine_version: this.engine.ruleSet?.version || '2.2.0',
      dataset_metrics: {
        total_records_analyzed: totalRecords,
        unique_uids: uniqueUids.size,
        production_statuses: productionStatusCounts,
        lender_volume_distribution: lenderVolume
      },
      contradiction_summary: {
        false_rejections_count: falseRejections.length,
        false_rejection_rate_on_disbursed: falseRejectionRate,
        reverse_contradictions_count: reverseContradictions.length,
        confirmed_disbursed_matches: confirmedMatches.length,
        external_lenders_count: externalLenderRecords.length
      },
      external_lender_breakdown: externalLenderBreakdown,
      lender_accuracy_matrix: lenderAccuracy,
      false_rejections_ledger: falseRejections,
      reverse_contradictions_ledger: reverseContradictions
    };

    return reconciliationReport;
  }

  /**
   * Reconciles production CSV against evaluation CSV or directly re-evaluates.
   * 
   * @param {string} prodCsvPath - Path to prod_data.csv
   * @param {string} evaluatedCsvPath - Optional path to pre-evaluated CSV
   * @returns {Object} Reconciliation report
   */
  reconcileFiles(prodCsvPath, evaluatedCsvPath = null) {
    if (!fs.existsSync(prodCsvPath)) {
      throw new Error(`Production data file not found at: ${prodCsvPath}`);
    }

    const prodContent = fs.readFileSync(prodCsvPath, 'utf8');
    const prodRows = parseCSV(prodContent);
    const prodHeaders = prodRows[0].map(h => h.trim());

    let evalRows = null;
    let evalHeaders = null;
    if (evaluatedCsvPath && fs.existsSync(evaluatedCsvPath)) {
      const evalContent = fs.readFileSync(evaluatedCsvPath, 'utf8');
      evalRows = parseCSV(evalContent);
      evalHeaders = evalRows[0].map(h => h.trim());
    }

    const records = [];
    for (let i = 1; i < prodRows.length; i++) {
      const pRow = prodRows[i];
      const pObj = { _rowNum: i + 1 };
      prodHeaders.forEach((h, idx) => {
        pObj[h] = pRow[idx] !== undefined ? pRow[idx].trim() : '';
      });

      // If evaluated CSV provided, correlate bank name or existing evaluated columns
      if (evalRows && evalRows[i]) {
        const eRow = evalRows[i];
        if (eRow[14]) {
          pObj["Co-Applicant's Bank Name"] = eRow[14].trim();
        }
      }

      records.push(pObj);
    }

    return this.reconcile(records);
  }
}

// CLI Execution support
if (require.main === module) {
  const prodPath = path.join(__dirname, '..', '..', 'prod_data.csv');
  const evalPath = path.join(__dirname, '..', '..', 'co_applicant_new_evaluated.csv');

  console.log('Running automated NBFC production outcome reconciliation...');
  const reconciler = new NBFCReconciliationService();
  const report = reconciler.reconcileFiles(prodPath, evalPath);

  console.log('\n======================================================');
  console.log('       NBFC PRODUCTION RECONCILIATION REPORT          ');
  console.log('======================================================');
  console.log(`Engine Version:             ${report.engine_version}`);
  console.log(`Total Records Analyzed:     ${report.dataset_metrics.total_records_analyzed}`);
  console.log(`Unique UIDs:                ${report.dataset_metrics.unique_uids}`);
  console.log(`False Rejections (Contradictions): ${report.contradiction_summary.false_rejections_count}`);
  console.log(`False Rejection Rate:       ${report.contradiction_summary.false_rejection_rate_on_disbursed}`);
  console.log(`Reverse Contradictions:     ${report.contradiction_summary.reverse_contradictions_count}`);
  console.log(`External Partner Records:   ${report.contradiction_summary.external_lenders_count}`);
  console.log('\n--- External Lenders Breakdown ---');
  console.table(report.external_lender_breakdown);
  console.log('\n--- Lender Accuracy Matrix ---');
  console.table(report.lender_accuracy_matrix);

  const outPath = path.join(__dirname, '..', '..', 'production_reconciliation_report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nDetailed reconciliation ledger written to: ${outPath}`);
}

module.exports = {
  NBFCReconciliationService,
  normalizeLenderCode,
  STANDARD_6_LENDERS
};
