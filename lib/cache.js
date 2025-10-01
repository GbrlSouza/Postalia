const NodeCache = require('node-cache');
const ttl = parseInt(process.env.CACHE_TTL_SECONDS || '600');
const cache = new NodeCache({ stdTTL: ttl, checkperiod: Math.round(ttl * 0.2) });
module.exports = cache;