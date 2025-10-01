const axios = require('axios');

async function fetchPostal(country, code) {
  const username = process.env.GEONAMES_USERNAME;
  if (!username) throw new Error('GEONAMES_USERNAME não configurado');
  const url = `http://api.geonames.org/postalCodeLookupJSON?postalcode=${encodeURIComponent(code)}&country=${encodeURIComponent(country)}&username=${username}`;
  const r = await axios.get(url, { timeout: 5000 });
  if (!r.data || !r.data.postalcodes || r.data.postalcodes.length === 0) return null;
  const p = r.data.postalcodes[0];
  return {
    provider: 'geonames',
    raw: p,
    normalized: {
      country: country,
      postalCode: p.postalCode || code,
      placeName: p.placeName || null,
      adminName1: p.adminName1 || null,
      lat: p.lat || null,
      lng: p.lng || null
    }
  };
}

module.exports = { fetchPostal };