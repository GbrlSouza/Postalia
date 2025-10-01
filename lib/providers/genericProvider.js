const axios = require('axios');

async function fetchFromTemplate(providerConfig, country, code) {
  const tmpl = process.env[providerConfig.templateEnvKey];
  if (!tmpl) return null;
  const apiKey = process.env[providerConfig.apiKeyEnvKey] || '';
  const url = tmpl.replace('{country}', encodeURIComponent(country))
                  .replace('{code}', encodeURIComponent(code))
                  .replace('{API_KEY}', encodeURIComponent(apiKey));
  try {
    const r = await axios.get(url, { timeout: 6000 });
    return {
      provider: providerConfig.name,
      raw: r.data,
      normalized: { raw: r.data }
    };
  } catch (err) {
    return null;
  }
}

module.exports = { fetchFromTemplate };