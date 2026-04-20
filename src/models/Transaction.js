const mongoose = require('mongoose');

/**
 * Transaction schema stores every ingested row (both valid and invalid).
 * The `source` field distinguishes user vs exchange data.
 * Invalid rows are flagged via `isValid` and `validationIssues` but never dropped.
 */
const transactionSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: null,
  },
  type: {
    type: String,
    required: false,
    default : '',
    
  },
  asset: {
    type: String,
    required: false,
    default : '',
  },
  quantity: {
    type: Number,
    required: false,
    default : 0,
  },
  price_usd: {
    type: Number,
    default: null,
  },
  fee: {
    type: Number,
    default: 0,
  },
  note: {
    type: String,
    default: '',
  },
  source: {
    type: String,
    enum: ['user', 'exchange'],
    required: true,
  },
  isValid: {
    type: Boolean,
    default: true,
  },
  validationIssues: {
    type: [String],
    default: [],
  },
  runId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ReconciliationRun',
    required: true,
  },
  raw: {
    type: mongoose.Schema.Types.Mixed,
  },
}, {
  timestamps: true,
});

// Index for efficient querying during matching
transactionSchema.index({ runId: 1, source: 1, isValid: 1 });
transactionSchema.index({ runId: 1, transactionId: 1, source: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
