const mongoose = require('mongoose');


const reconciliationRunSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed'],
    default: 'pending',
  },
  config: {
    timestampToleranceSeconds: {
      type: Number,
      required: true,
    },
    quantityTolerancePct: {
      type: Number,
      required: true,
    },
  },
  summary: {
    matched: { type: Number, default: 0 },
    conflicting: { type: Number, default: 0 },
    unmatchedUser: { type: Number, default: 0 },
    unmatchedExchange: { type: Number, default: 0 },
    flaggedRows: { type: Number, default: 0 },
  },
  reportPath: {
    type: String,
    default: '',
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('ReconciliationRun', reconciliationRunSchema);
