const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const Transaction = require('../models/Transaction');
const { normalizeAsset } = require('../utils/assetAliases');
const logger = require('../utils/logger');

/**
 * Parse a single CSV file, validate each row, and store in MongoDB.
 * Invalid rows are flagged but never dropped — they're stored with isValid: false.
 *
 * @param {string} filePath - Absolute path to the CSV file
 * @param {string} source - 'user' or 'exchange'
 * @param {ObjectId} runId - The reconciliation run ID
 * @returns {Promise<{ total: number, valid: number, flagged: number }>}
 */
const ingestCSV = async (filePath, source, runId) => {
  const rows = await parseCSVFile(filePath);
  const seenIds = new Set();
  const transactions = [];
  let validCount = 0;
  let flaggedCount = 0;

  for (const row of rows) {
    const issues = [];
    let isValid = true;


    if (seenIds.has(row.transaction_id)) {
      issues.push('Duplicate transaction_id');
      isValid = false;
      logger.warn(`[${source}] Duplicate transaction_id: ${row.transaction_id}`);
    }
    seenIds.add(row.transaction_id);

  
    let parsedTimestamp = null;
    const rawTimestamp = (row.timestamp || '').trim();

    if (!rawTimestamp) {
      issues.push('Missing timestamp');
      isValid = false;
      logger.warn(`[${source}] Missing timestamp for ${row.transaction_id}`);
    } else {
      parsedTimestamp = new Date(rawTimestamp);
      if (isNaN(parsedTimestamp.getTime())) {
        issues.push('Malformed timestamp');
        isValid = false;
        parsedTimestamp = null;
        logger.warn(`[${source}] Malformed timestamp for ${row.transaction_id}: "${rawTimestamp}"`);
      }
    }

    
    const quantity = parseFloat(row.quantity);
    if (!isNaN(quantity) && quantity < 0) {
      issues.push('Negative quantity');
      isValid = false;
      logger.warn(`[${source}] Negative quantity for ${row.transaction_id}: ${quantity}`);
    }

    if (!row.transaction_id || !row.transaction_id.trim()) {
      issues.push('Missing required field: transaction_id');
      isValid = false;
    }
    if (!row.type || !row.type.trim()) {
      issues.push('Missing required field: type');
      isValid = false;
    }
    if (!row.asset || !row.asset.trim()) {
      issues.push('Missing required field: asset');
      isValid = false;
    }
    if (row.quantity === undefined || row.quantity === null || row.quantity === '' || isNaN(parseFloat(row.quantity))) {
      issues.push('Missing required field: quantity');
      isValid = false;
    }

    const normalizedAsset = normalizeAsset(row.asset);

    const txn = {
      transactionId: (row.transaction_id || '').trim(),
      timestamp: parsedTimestamp,
      type: (row.type || '').trim().toUpperCase(),
      asset: normalizedAsset,
      quantity: isNaN(quantity) ? 0 : quantity,
      price_usd: row.price_usd ? parseFloat(row.price_usd) : null,
      fee: row.fee ? parseFloat(row.fee) : 0,
      note: (row.note || '').trim(),
      source,
      isValid,
      validationIssues: issues,
      runId,
      raw: { ...row }, 
    };

    transactions.push(txn);

    if (isValid) {
      validCount++;
    } else {
      flaggedCount++;
    }
  }

  
  if (transactions.length > 0) {
    await Transaction.insertMany(transactions);
  }

  logger.info(`[${source}] Ingested ${transactions.length} rows (valid: ${validCount}, flagged: ${flaggedCount})`);

  return {
    total: transactions.length,
    valid: validCount,
    flagged: flaggedCount,
  };
};


const parseCSVFile = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (err) => reject(err));
  });
};


const ingestAll = async (runId) => {
  const dataDir = path.join(__dirname, '..', '..', 'data');
  const userFile = path.join(dataDir, 'user_transactions.csv');
  const exchangeFile = path.join(dataDir, 'exchange_transactions.csv');

  logger.info('Starting CSV ingestion...');

  const userStats = await ingestCSV(userFile, 'user', runId);
  const exchangeStats = await ingestCSV(exchangeFile, 'exchange', runId);

  logger.info('CSV ingestion complete.');

  return { user: userStats, exchange: exchangeStats };
};

module.exports = { ingestAll, ingestCSV };
