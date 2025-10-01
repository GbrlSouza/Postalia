const geonames = require('./providers/geonames');
const generic = require('./providers/genericProvider');

const providersCatalog = {
  geonames: {
    name: 'geonames',
    fn: geonames.fetchPostal
  },
  postalcodesapp: {
    name: 'postalcodesapp',
    fn: (c, p) => generic.fetchFromTemplate({ name: 'postalcodesapp', templateEnvKey: 'POSTALCODESAPP_TEMPLATE', apiKeyEnvKey: 'POSTALCODESAPP_KEY' }, c, p)
  },
  zipcodestack: {
    name: 'zipcodestack',
    fn: (c, p) => generic.fetchFromTemplate({ name: 'zipcodestack', templateEnvKey: 'ZIPCODESTACK_TEMPLATE', apiKeyEnvKey: 'ZIPCODESTACK_KEY' }, c, p)
  },
  zipbase: {
    name: 'zipbase',
    fn: (c, p) => generic.fetchFromTemplate({ name: 'zipbase', templateEnvKey: 'ZIPBASE_TEMPLATE', apiKeyEnvKey: 'ZIPBASE_KEY' }, c, p)
  },
  zipapi: {
    name: 'zipapi',
    fn: (c, p) => generic.fetchFromTemplate({ name: 'zipapi', templateEnvKey: 'ZIPAPI_TEMPLATE', apiKeyEnvKey: 'ZIPAPI_KEY' }, c, p)
  },
  openplz: {
    name: 'openplz',
    fn: (c, p) => generic.fetchFromTemplate({ name: 'openplz', templateEnvKey: 'OPENPLZ_TEMPLATE', apiKeyEnvKey: '' }, c, p)
  }
};

function listProviders() {
  return Object.keys(providersCatalog);
}

async function query(country, code) {
  const order = (process.env.PROVIDERS_ORDER || 'geonames').split(',').map(s => s.trim()).filter(Boolean);
  for (const id of order) {
    const p = providersCatalog[id];
    if (!p) continue;
    try {
      const res = await p.fn(country, code);
      if (res) return res;
    } catch (err) {
      console.warn(`Provider ${id} falhou:`, err.message);
    }
  }
  return null;
}

async function search(country, q) {
  const order = (process.env.PROVIDERS_ORDER || 'geonames').split(',').map(s => s.trim()).filter(Boolean);
  for (const id of order) {
    const p = providersCatalog[id];
    if (!p) continue;
    try {
      const res = await p.fn(country, q);
      if (res) return res;
    } catch (err) { }
  }
  return null;
}

module.exports = { listProviders, query, search };