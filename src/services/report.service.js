const fs = require('fs');
const path = require('path');
const { Parser } = require('json2csv');
const ReconciliationRun = require('../models/ReconciliationRun');
const logger = require('../utils/logger');

const reportsDir = path.join(__dirname, '..', '..', 'reports');
fs.mkdirSync(reportsDir, { recursive: true });


const generateReport = async (runId, results, summary) => {
  logger.info(`Generating report for run ${runId}...`);

  
  const csvRows = results.map((entry) => {
    const userTxn = entry.userTxn || {};
    const excTxn = entry.exchangeTxn || {};

    return {
      category: entry.category,
      reason: entry.reason,
      user_transaction_id: userTxn.transactionId || '',
      user_timestamp: userTxn.timestamp ? new Date(userTxn.timestamp).toISOString() : '',
      user_type: userTxn.type || '',
      user_asset: userTxn.asset || '',
      user_quantity: userTxn.quantity != null ? userTxn.quantity : '',
      user_price_usd: userTxn.price_usd != null ? userTxn.price_usd : '',
      user_fee: userTxn.fee != null ? userTxn.fee : '',
      exchange_transaction_id: excTxn.transactionId || '',
      exchange_timestamp: excTxn.timestamp ? new Date(excTxn.timestamp).toISOString() : '',
      exchange_type: excTxn.type || '',
      exchange_asset: excTxn.asset || '',
      exchange_quantity: excTxn.quantity != null ? excTxn.quantity : '',
      exchange_price_usd: excTxn.price_usd != null ? excTxn.price_usd : '',
      exchange_fee: excTxn.fee != null ? excTxn.fee : '',
    };
  });

  
  const fields = [
    'category',
    'reason',
    'user_transaction_id',
    'user_timestamp',
    'user_type',
    'user_asset',
    'user_quantity',
    'user_price_usd',
    'user_fee',
    'exchange_transaction_id',
    'exchange_timestamp',
    'exchange_type',
    'exchange_asset',
    'exchange_quantity',
    'exchange_price_usd',
    'exchange_fee',
  ];

  const parser = new Parser({ fields });
  const csvContent = parser.parse(csvRows);


  const reportFileName = `${runId}.csv`;
  const reportPath = path.join(reportsDir, reportFileName);
  fs.writeFileSync(reportPath, csvContent, 'utf-8');


  await ReconciliationRun.findByIdAndUpdate(runId, {
    summary,
    reportPath,
    status: 'completed',
  });

  logger.info(`Report saved to ${reportPath}`);

  return reportPath;
};

module.exports = { generateReport };
