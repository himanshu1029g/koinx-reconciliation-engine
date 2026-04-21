const Transaction = require('../models/Transaction');
const { normalizeTypeForMatching } = require('../utils/typeMapping');
const logger = require('../utils/logger');


const matchTransactions = async (runId, config) => {
  const { timestampToleranceSeconds, quantityTolerancePct } = config;

  logger.info(`Starting matching engine (tolerance: ${timestampToleranceSeconds}s timestamp, ${quantityTolerancePct * 100}% quantity)`);


  const userTxns = await Transaction.find({ runId, source: 'user', isValid: true }).lean();
  const exchangeTxns = await Transaction.find({ runId, source: 'exchange', isValid: true }).lean();
  const flaggedTxns = await Transaction.find({ runId, isValid: false }).lean();


  const matchedExchangeIds = new Set();
  const matchedUserIds = new Set();
  const results = [];


  for (const userTxn of userTxns) {

    if (matchedUserIds.has(userTxn._id.toString())) continue;

    const userType = normalizeTypeForMatching(userTxn.type);
    let bestMatch = null;

    for (const excTxn of exchangeTxns) {

      if (matchedExchangeIds.has(excTxn._id.toString())) continue;

  
      if (userTxn.asset.toUpperCase() !== excTxn.asset.toUpperCase()) continue;


      const excType = normalizeTypeForMatching(excTxn.type);
      if (userType !== excType) continue;


      const timeDiff = Math.abs(
        new Date(userTxn.timestamp).getTime() - new Date(excTxn.timestamp).getTime()
      ) / 1000;
      if (timeDiff > timestampToleranceSeconds) continue;

      const qtyDiffPct = Math.abs(userTxn.quantity - excTxn.quantity) / Math.abs(userTxn.quantity);
      if (qtyDiffPct > quantityTolerancePct) continue;

      bestMatch = excTxn;
      break;
    }

    if (bestMatch) {
      
      const conflicts = [];

      // Check quantity difference
      if (userTxn.quantity !== bestMatch.quantity) {
        const diff = Math.abs(userTxn.quantity - bestMatch.quantity);
        const diffPct = (diff / Math.abs(userTxn.quantity) * 100).toFixed(2);
        conflicts.push(`Quantity differs: user=${userTxn.quantity}, exchange=${bestMatch.quantity} (diff=${diffPct}%)`);
      }

      if (userTxn.price_usd != null && bestMatch.price_usd != null) {
        if (userTxn.price_usd !== bestMatch.price_usd) {
          const diff = Math.abs(userTxn.price_usd - bestMatch.price_usd);
          conflicts.push(`Price differs: user=${userTxn.price_usd}, exchange=${bestMatch.price_usd} (diff=${diff})`);
        }
      }

      if (userTxn.fee !== bestMatch.fee) {
        const userFee = userTxn.fee || 0;
        const excFee = bestMatch.fee || 0;
        if (userFee !== excFee) {
          const diffPct = userFee !== 0
            ? (Math.abs(userFee - excFee) / Math.abs(userFee) * 100).toFixed(1)
            : 'N/A';
          conflicts.push(`Fee differs: user=${userFee}, exchange=${excFee} (diff=${diffPct}%)`);
        }
      }

      const category = conflicts.length > 0 ? 'CONFLICTING' : 'MATCHED';
      const reason = conflicts.length > 0
        ? conflicts.join('; ')
        : 'All fields within tolerance';

      results.push({
        category,
        reason,
        userTxn,
        exchangeTxn: bestMatch,
      });

      matchedUserIds.add(userTxn._id.toString());
      matchedExchangeIds.add(bestMatch._id.toString());
    }
  }

  for (const userTxn of userTxns) {
    if (!matchedUserIds.has(userTxn._id.toString())) {
      results.push({
        category: 'UNMATCHED_USER',
        reason: 'No matching exchange transaction found',
        userTxn,
        exchangeTxn: null,
      });
    }
  }

  for (const excTxn of exchangeTxns) {
    if (!matchedExchangeIds.has(excTxn._id.toString())) {
      results.push({
        category: 'UNMATCHED_EXCHANGE',
        reason: 'No matching user transaction found',
        userTxn: null,
        exchangeTxn: excTxn,
      });
    }
  }

  for (const txn of flaggedTxns) {
    results.push({
      category: 'FLAGGED',
      reason: txn.validationIssues.join('; '),
      userTxn: txn.source === 'user' ? txn : null,
      exchangeTxn: txn.source === 'exchange' ? txn : null,
    });
  }

  // --- Log summary ---
  const summary = {
    matched: results.filter(r => r.category === 'MATCHED').length,
    conflicting: results.filter(r => r.category === 'CONFLICTING').length,
    unmatchedUser: results.filter(r => r.category === 'UNMATCHED_USER').length,
    unmatchedExchange: results.filter(r => r.category === 'UNMATCHED_EXCHANGE').length,
    flaggedRows: results.filter(r => r.category === 'FLAGGED').length,
  };

  logger.info(`Matching complete — Matched: ${summary.matched}, Conflicting: ${summary.conflicting}, Unmatched User: ${summary.unmatchedUser}, Unmatched Exchange: ${summary.unmatchedExchange}, Flagged: ${summary.flaggedRows}`);

  return { results, summary };
};

module.exports = { matchTransactions };
