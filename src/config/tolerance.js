const getToleranceConfig = (overrides = {}) => {
  const envTimestamp = parseInt(process.env.TIMESTAMP_TOLERANCE_SECONDS, 10);
  const envQuantity = parseFloat(process.env.QUANTITY_TOLERANCE_PCT);

  return {
    timestampToleranceSeconds: overrides.timestampToleranceSeconds != null
      ? overrides.timestampToleranceSeconds
      : (!isNaN(envTimestamp) ? envTimestamp : 300),
    quantityTolerancePct: overrides.quantityTolerancePct != null
      ? overrides.quantityTolerancePct
      : (!isNaN(envQuantity) ? envQuantity : 0.0001),
  };
};

module.exports = { getToleranceConfig };