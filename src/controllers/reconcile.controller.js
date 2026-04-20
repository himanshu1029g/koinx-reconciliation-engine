const fs = require('fs');
const csv = require('csv-parser');
const { Readable } = require('stream');
const ReconciliationRun = require('../models/ReconciliationRun');
const { getToleranceConfig } = require('../config/tolerance');
const { ingestAll } = require('../services/ingestion.service');
const { matchTransactions } = require('../services/matching.service');
const { generateReport } = require('../services/report.service');
const logger = require('../utils/logger');

/**
 * POST /reconcile
 * Trigger a full reconciliation run.
 * Accepts optional body: { timestampToleranceSeconds, quantityTolerancePct }
 * Falls back to env values if not provided.
 */
const triggerReconciliation = async (req, res) => {
  try {
    const config = getToleranceConfig(req.body || {});

    logger.info('=== Starting new reconciliation run ===');
    logger.info(`Config: timestamp tolerance = ${config.timestampToleranceSeconds}s, quantity tolerance = ${config.quantityTolerancePct * 100}%`);

    // Create a new run document
    const run = await ReconciliationRun.create({
      status: 'running',
      config,
    });

    const runId = run._id;
    logger.info(`Run ID: ${runId}`);

    // Step 1: Ingest CSVs
    await ingestAll(runId);

    // Step 2: Run matching engine
    const { results, summary } = await matchTransactions(runId, config);

    // Step 3: Generate report
    await generateReport(runId, results, summary);

    logger.info('=== Reconciliation run completed ===');

    return res.status(200).json({
      runId,
      status: 'completed',
      summary,
    });
  } catch (error) {
    logger.error(`Reconciliation failed: ${error.message}`, { stack: error.stack });
    return res.status(500).json({
      error: 'Reconciliation failed',
      message: error.message,
    });
  }
};

/**
 * GET /report/:runId
 * Download the full reconciliation report as a CSV file.
 */
const getReport = async (req, res) => {
  try {
    const run = await ReconciliationRun.findById(req.params.runId);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    if (!run.reportPath || !fs.existsSync(run.reportPath)) {
      return res.status(404).json({ error: 'Report file not found' });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.runId}.csv"`);

    const fileStream = fs.createReadStream(run.reportPath);
    fileStream.pipe(res);
  } catch (error) {
    logger.error(`Error fetching report: ${error.message}`);
    return res.status(500).json({ error: 'Failed to fetch report', message: error.message });
  }
};

/**
 * GET /report/:runId/summary
 * Get the JSON summary of a reconciliation run.
 */
const getReportSummary = async (req, res) => {
  try {
    const run = await ReconciliationRun.findById(req.params.runId);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    return res.status(200).json({
      runId: run._id,
      status: run.status,
      config: run.config,
      summary: run.summary,
    });
  } catch (error) {
    logger.error(`Error fetching summary: ${error.message}`);
    return res.status(500).json({ error: 'Failed to fetch summary', message: error.message });
  }
};

/**
 * GET /report/:runId/unmatched
 * Get only UNMATCHED_USER and UNMATCHED_EXCHANGE entries with reasons.
 */
const getUnmatched = async (req, res) => {
  try {
    const run = await ReconciliationRun.findById(req.params.runId);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    if (!run.reportPath || !fs.existsSync(run.reportPath)) {
      return res.status(404).json({ error: 'Report file not found' });
    }

    // Read the CSV and filter for unmatched rows
    const csvContent = fs.readFileSync(run.reportPath, 'utf-8');
    const readable = Readable.from(csvContent);
    const rows = [];

    await new Promise((resolve, reject) => {
      readable
        .pipe(csv())
        .on('data', (row) => {
          if (row.category === 'UNMATCHED_USER' || row.category === 'UNMATCHED_EXCHANGE') {
            rows.push(row);
          }
        })
        .on('end', () => resolve())
        .on('error', (err) => reject(err));
    });

    return res.status(200).json(rows);
  } catch (error) {
    logger.error(`Error fetching unmatched: ${error.message}`);
    return res.status(500).json({ error: 'Failed to fetch unmatched entries', message: error.message });
  }
};

module.exports = {
  triggerReconciliation,
  getReport,
  getReportSummary,
  getUnmatched,
};
