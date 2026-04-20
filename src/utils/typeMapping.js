
const normalizeTypeForMatching = (type) => {
  const upper = (type || '').toUpperCase().trim();
  if (upper === 'TRANSFER_IN' || upper === 'TRANSFER_OUT') {
    return 'TRANSFER';
  }
  return upper;
};

module.exports = { normalizeTypeForMatching };
