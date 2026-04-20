
const ASSET_ALIASES = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  solana: 'SOL',
  polygon: 'MATIC',
};


const normalizeAsset = (rawAsset) => {
  if (!rawAsset) return '';
  const lower = rawAsset.trim().toLowerCase();
  return ASSET_ALIASES[lower] || rawAsset.trim().toUpperCase();
};

module.exports = { ASSET_ALIASES, normalizeAsset };
