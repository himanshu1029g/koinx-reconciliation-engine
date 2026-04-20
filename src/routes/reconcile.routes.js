const express = require('express');
const {
  triggerReconciliation,
  getReport,
  getReportSummary,
  getUnmatched,
} = require('../controllers/reconcile.controller');

const router = express.Router();

router.post('/reconcile', triggerReconciliation);
router.get('/report/:runId', getReport);
router.get('/report/:runId/summary', getReportSummary);
router.get('/report/:runId/unmatched', getUnmatched);

module.exports = router;