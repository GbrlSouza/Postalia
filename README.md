# Postalia — API unificadora de CEPs

> Pequena, graciosa e livre — uma API REST que agrega diversas fontes de CEP/códigos postais do mundo.

Postalia é uma camada de unificação (proxy/aggregator) **open-source** que consulta múltiplos provedores de CEP (GeoNames, PostalCodes.app, ZipCodeStack, ZipBase, ZIPAPI.eu, OpenPLZ e outros configuráveis) e entrega uma resposta normalizada para seu produto.

---

## Principais objetivos

* Fornecer um único endpoint REST para consultar CEPs/códigos postais de vários provedores.
* Modelo modular de *providers* (adaptadores) facilmente adicionáveis.
* Cache in-memory simples, fallback entre provedores e logging.
* Configuração via variáveis de ambiente (chaves, templates de URLs, limites).

---

## Nome: **Postalia**

Por que Postalia? soa leve, internacional e lembra correio — um nome que abraça lugares.

---

## Estrutura do projeto (exemplo)

```
postalia/
├─ package.json
├─ .env.example
├─ README.md
├─ index.js            # servidor + rotas
├─ lib/
│  ├─ providers/       # adaptadores para cada API externa
│  │  ├─ geonames.js
│  │  ├─ genericProvider.js
│  ├─ providerManager.js
│  ├─ cache.js
│  └─ normalizer.js
└─ Dockerfile
```

---

## Arquivos principais (conteúdo)

### package.json

```json
{
  "name": "postalia",
  "version": "0.1.0",
  "description": "Unified postal code API aggregator",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "keywords": ["cep","postal","postal-code","post","api","proxy"],
  "license": "MIT",
  "dependencies": {
    "axios": "^1.4.0",
    "dotenv": "^16.0.0",
    "express": "^4.18.2",
    "express-rate-limit": "^6.0.5",
    "node-cache": "^5.1.2",
    "morgan": "^1.10.0"
  },
  "devDependencies": {
    "nodemon": "^2.0.22"
  }
}
```

---

### .env.example

```
PORT=3000
CACHE_TTL_SECONDS=600
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=200

# GeoNames (precisa de username gratuito)
GEONAMES_USERNAME=seu_geonames_username

# Provedores genéricos: configure templates se quiser usar
# Use as chaves {country} e {code} e {API_KEY} nos templates
POSTALCODESAPP_TEMPLATE=https://api.postalcodes.app/{country}/{code}?key={API_KEY}
POSTALCODESAPP_KEY=

ZIPCODESTACK_TEMPLATE=https://api.zipcodestack.com/{country}/{code}?apikey={API_KEY}
ZIPCODESTACK_KEY=

ZIPBASE_TEMPLATE=https://api.zipbase.io/{country}/{code}?key={API_KEY}
ZIPBASE_KEY=

ZIPAPI_TEMPLATE=https://api.zip-api.eu/rest/{code}/{country}
ZIPAPI_KEY=

# OpenPLZ não precisa de chave (exemplo)
OPENPLZ_TEMPLATE=https://openplzapi.org/plz/{code}

# Lista de providers na ordem de preferência (vírgula separado)
PROVIDERS_ORDER=geonames,postalcodesapp,zipcodestack,zipbase,zipapi,openplz
```

---

### index.js (servidor e rotas)

```js
require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const providerManager = require('./lib/providerManager');
const cache = require('./lib/cache');

const app = express();
app.use(express.json());
app.use(morgan('tiny'));

// Rate limiter básico
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  max: parseInt(process.env.RATE_LIMIT_MAX || '200')
});
app.use(limiter);

// Health
app.get('/v1/health', (req, res) => res.json({ok: true, ts: Date.now()}));

// Lista providers
app.get('/v1/providers', (req, res) => {
  res.json({providers: providerManager.listProviders()});
});

// Endpoint principal: consulta por país + código postal (ex: BR/01001-000 ou US/90210)
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

// Busca livre (query) — opcional
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
```

---

### lib/cache.js

```js
const NodeCache = require('node-cache');
const ttl = parseInt(process.env.CACHE_TTL_SECONDS || '600');
const cache = new NodeCache({ stdTTL: ttl, checkperiod: Math.round(ttl * 0.2) });
module.exports = cache;
```

---

### lib/providers/geonames.js

```js
const axios = require('axios');

async function fetchPostal(country, code) {
  const username = process.env.GEONAMES_USERNAME;
  if (!username) throw new Error('GEONAMES_USERNAME não configurado');
  // Endpoint oficial de postal codes lookup
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
```

---

### lib/providers/genericProvider.js

```js
const axios = require('axios');

// providerConfig: { name, templateEnvKey, apiKeyEnvKey, replaceKeys }
async function fetchFromTemplate(providerConfig, country, code) {
  const tmpl = process.env[providerConfig.templateEnvKey];
  if (!tmpl) return null; // não configurado
  const apiKey = process.env[providerConfig.apiKeyEnvKey] || '');
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
    // se falhar, retorna null para permitir fallback
    return null;
  }
}

module.exports = { fetchFromTemplate };
```

---

### lib/providerManager.js

```js
const geonames = require('./providers/geonames');
const generic = require('./providers/genericProvider');

// Mapeamento simples; adicione adaptadores conforme quiser
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
      // ignora e tenta o próximo
      console.warn(`Provider ${id} falhou:`, err.message);
    }
  }
  return null;
}

async function search(country, q) {
  // pesquisa simples: tenta providers na ordem e retorna primeiros resultados
  const order = (process.env.PROVIDERS_ORDER || 'geonames').split(',').map(s => s.trim()).filter(Boolean);
  for (const id of order) {
    const p = providersCatalog[id];
    if (!p) continue;
    // muitos provedores têm endpoints de busca — não implementado universalmente aqui
    try {
      const res = await p.fn(country, q);
      if (res) return res;
    } catch (err) { }
  }
  return null;
}

module.exports = { listProviders, query, search };
```

---

## Dockerfile

```Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node","index.js"]
```

---

## README (resumido para GitHub)

Incluído neste arquivo: descrição do projeto, como rodar local, variáveis de ambiente e exemplos `curl`.

### Como rodar localmente

1. Clone o repositório
2. Copie `.env.example` para `.env` e configure suas keys
3. `npm install`
4. `npm start` (ou `npm run dev`)

### Exemplos de uso

```bash
# consulta CEP 01001-000 no Brasil
curl 'http://localhost:3000/v1/postal/BR/01001-000'

# lista providers
curl 'http://localhost:3000/v1/providers'
```

---

## Observações importantes

* Este template prioriza simplicidade e extensibilidade. Adicione adaptadores específicos caso o provedor possua JSON/formatos próprios.
* Respeite os Termos de Uso dos provedores (limites, caching e attribution quando exigido).
* Se quiser autenticação (API key para seu Postalia), adicione middleware para validar chaves ou JWT.

---

## Licença

MIT — sinta-se livre para forkar, melhorar e compartilhar.
