const QRCode = require('qrcode');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

class HttpError extends Error {
  constructor(status, message, code = '') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function baseUrl() {
  return (process.env.MEDUSA_BASE_URL || 'https://api.medusapayments.online/api/v1')
    .replace(/\/+$/, '');
}

async function medusa(method, path, payload) {
  const key = process.env.MEDUSA_API_KEY;
  if (!key) {
    throw new HttpError(500, 'API Key da Medusa não configurada (MEDUSA_API_KEY)', 'SEM_CHAVE');
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 35000);
  try {
    const headers = {
      Authorization: 'Bearer ' + key,
      Accept: 'application/json',
      'User-Agent': UA
    };
    if (payload !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(baseUrl() + path, {
      method,
      headers,
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
      signal: ctrl.signal
    });
    const text = await r.text();
    let obj = {};
    if (text) {
      try { obj = JSON.parse(text); } catch (e) { obj = { message: text.slice(0, 300) }; }
    }
    if (!r.ok) {
      throw new HttpError(r.status, obj.message || 'Falha na API Medusa', obj.code || '');
    }
    return obj;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (e && e.name === 'AbortError') {
      throw new HttpError(504, 'A Medusa demorou demais para responder', 'TIMEOUT');
    }
    throw new HttpError(502, 'Não foi possível falar com a Medusa: ' + (e.message || e), 'FALHA_CONEXAO');
  } finally {
    clearTimeout(timer);
  }
}

async function qrDataUrl(text) {
  try {
    return await QRCode.toDataURL(text, { margin: 1, width: 440 });
  } catch (e) {
    return null;
  }
}

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
}

function digits(v) {
  return String(v == null ? '' : v).replace(/\D/g, '');
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (e) { throw new HttpError(400, 'JSON inválido', 'JSON_INVALIDO'); }
  }
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw || raw.length > 1000000) {
    throw new HttpError(400, 'Corpo da requisição inválido', 'CORPO_INVALIDO');
  }
  try { return JSON.parse(raw); } catch (e) { throw new HttpError(400, 'JSON inválido', 'JSON_INVALIDO'); }
}

module.exports = { HttpError, medusa, qrDataUrl, json, digits, readBody };
