require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const providerManager = require('./lib/providerManager');
const cache = require('./lib/cache');

const app = express();
app.use(express.json());
app.use(morgan('tiny'));

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  max: parseInt(process.env.RATE_LIMIT_MAX || '200')
});
app.use(limiter);

app.get('/v1/health', (req, res) => res.json({ok: true, ts: Date.now()}));

app.get('/v1/providers', (req, res) => {
  res.json({providers: providerManager.listProviders()});
});

app.get('/v1/postal/:country/:code', async (req, res) => {
  const country = req.params.country.toUpperCase();
  const code = req.params.code;
  const cacheKey = `postal:${country}:${code}`;

  const cached = cache.get(cacheKey);
  if (cached) return res.json({fromCache: true, data: cached});

  try {
    const result = await providerManager.query(country, code);
    if (!result) return res.status(404).json({error: 'Não encontrado pelos provedores configurados.'});
    cache.set(cacheKey, result);
    res.json({fromCache: false, data: result});
  } catch (err) {
    console.error(err);
    res.status(500).json({error: 'Erro interno', details: err.message});
  }
});

app.get('/v1/search', async (req, res) => {
  const country = (req.query.country || '').toUpperCase();
  const q = req.query.q;
  if (!country || !q) return res.status(400).json({error: 'country e q são obrigatórios'});
  try {
    const result = await providerManager.search(country, q);
    res.json({data: result});
  } catch (err) {
    console.error(err);
    res.status(500).json({error: 'Erro interno', details: err.message});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Postalia rodando na porta ${PORT}`));
