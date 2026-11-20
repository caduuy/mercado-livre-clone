/* Worker do Pix — Mercado Livre clone.
 * Rotas:
 *   GET  /api/health       → checagem de serviço
 *   POST /api/pix          → cria cobrança (Mangofy ≤ limite, senão Medusa; fallback Medusa→Mangofy)
 *   GET  /api/pix/:id     → consulta status
 *   POST /api/meta-capi   → proxy da Conversions API (token fica em secreto)
 * Chaves ficam em "wrangler secret", nunca no site. */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const STATUS = {
  waiting_payment: 'pendente', pending: 'pendente', processing: 'pendente',
  paid: 'aprovado', approved: 'aprovado',
  refused: 'recusado', canceled: 'recusado', cancelled: 'recusado',
  refunded: 'estornado', chargedback: 'estornado'
};

function json(status, obj, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      ...extraHeaders
    }
  });
}

function digits(v) {
  return String(v == null ? '' : v).replace(/\D/g, '');
}

function cfg(env) {
  return {
    medusaBase: (env.MEDUSA_BASE_URL || 'https://api.medusapayments.com/v1').replace(/\/+$/, ''),
    mangofyBase: (env.MANGOFY_BASE_URL || 'https://checkout.mangofy.com.br').replace(/\/+$/, ''),
    pixMaxMangofy: Number(env.PIX_MAX_MANGOFY) || 400,
    pixelId: env.META_PIXEL_ID || '1126035016737080',
    graphVersion: env.META_GRAPH_VERSION || 'v21.0'
  };
}

class HttpError extends Error {
  constructor(status, message, code = '') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function apiFetch(method, url, payload, headers = {}) {
  const cab = { ...headers, Accept: 'application/json', 'User-Agent': UA };
  if (payload !== undefined) cab['Content-Type'] = 'application/json';
  let r;
  try {
    r = await fetch(url, {
      method,
      headers: cab,
      body: payload !== undefined ? JSON.stringify(payload) : undefined
    });
  } catch (e) {
    throw new HttpError(502, 'Não foi possível conectar ao serviço de pagamento', 'FALHA_CONEXAO');
  }
  const text = await r.text();
  let obj = {};
  if (text) {
    try { obj = JSON.parse(text); } catch (e) { obj = { message: text.slice(0, 300) }; }
  }
  if (!r.ok) {
    throw new HttpError(r.status, obj.message || obj.error || 'Falha no serviço de pagamento', obj.code || '');
  }
  return obj;
}

async function medusa(env, method, path, payload) {
  let key = String(env.MEDUSA_API_KEY || '').trim();
  if (!key) throw new HttpError(500, 'API Key da Medusa não configurada', 'SEM_CHAVE');
  if (key.startsWith('mk_live_')) key = 'sk_live_' + key.slice('mk_live_'.length);
  const auth = 'Basic ' + btoa('x:' + key);
  return apiFetch(method, cfg(env).medusaBase + path, payload, { Authorization: auth });
}

async function mangofy(env, method, path, payload) {
  const key = String(env.MANGOFY_API_KEY || '').trim();
  const store = String(env.MANGOFY_STORE_CODE || '').trim();
  if (!key) throw new HttpError(500, 'MANGOFY_API_KEY não configurada', 'SEM_CHAVE');
  if (!store) throw new HttpError(500, 'MANGOFY_STORE_CODE não configurado', 'SEM_STORE');
  return apiFetch(method, cfg(env).mangofyBase + path, payload, { Authorization: key, 'Store-Code': store });
}

const WORKER_BASE = 'https://mercado-pix.ce855272.workers.dev';

function bodyMangofy(pedido, centavos, produto, cpf, nome, email, telefone, end, ipCliente) {
  const uf = String(end.uf || '').trim().toUpperCase();
  return {
    external_code: String(pedido.orderId || '').trim() || 'pedido-' + Date.now(),
    payment_method: 'pix',
    payment_format: 'regular',
    installments: 1,
    payment_amount: centavos,
    shipping_amount: 0,
    items: [{ code: 'item-1', name: produto, quantity: 1, price: centavos, description: produto, digital_flag: true }],
    customer: {
      name: nome,
      email: email,
      document: cpf,
      phone: '55' + (telefone.length >= 10 ? telefone : '11999999999'),
      ip: (ipCliente || '127.0.0.1').slice(0, 45)
    },
    shipping: {
      address: {
        street: String(end.endereco || '').trim(),
        streetNumber: String(end.numero || '').trim(),
        zipCode: digits(end.cep),
        neighborhood: String(end.bairro || '').trim(),
        city: String(end.cidade || '').trim(),
        state: uf,
        country: 'BR',
        complement: String(end.complemento || '').trim()
      }
    },
    pix: { expires_in_days: 1 },
    postback_url: WORKER_BASE + '/api/postback'
  };
}

async function criarPix(request, env) {
  let pedido;
  try {
    pedido = await request.json();
  } catch (e) {
    throw new HttpError(400, 'JSON inválido', 'JSON_INVALIDO');
  }
  const valor = Math.round((Number(pedido.valor) || 0) * 100) / 100;
  const cpf = digits(pedido.clienteCpf);
  const nome = String(pedido.clienteNome || '').trim();
  const email = String(pedido.clienteEmail || '').trim();
  const produto = String(pedido.produto || 'Pedido').trim().slice(0, 200);
  const telefone = digits(pedido.clienteTelefone);
  const end = pedido.endereco || {};

  if (!(valor > 0)) throw new HttpError(400, 'Valor do pedido inválido', 'VALOR_INVALIDO');
  if (cpf.length !== 11 && cpf.length !== 14) throw new HttpError(400, 'Informe um CPF (ou CNPJ) válido para gerar o Pix', 'CPF_INVALIDO');
  if (!nome) throw new HttpError(400, 'Informe o nome do comprador', 'NOME_INVALIDO');
  if (email.indexOf('@') < 1) throw new HttpError(400, 'Informe um e-mail válido', 'EMAIL_INVALIDO');

  const centavos = Math.round(valor * 100);
  const ipCliente = (request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '').split(',')[0].trim();
  const payloadMg = bodyMangofy(pedido, centavos, produto, cpf, nome, email, telefone, end, ipCliente);

  const usarMangofy = valor <= cfg(env).pixMaxMangofy;
  if (usarMangofy) {
    try {
      const mg = await mangofy(env, 'POST', '/api/v1/payment', payloadMg);
      const mgPix = mg.pix || {};
      const codigo = mgPix.pix_qrcode_text;
      if (!codigo) throw new HttpError(502, mg.message || 'Mangofy não retornou o código Pix', 'PIX_INDISPONIVEL');
      return json(200, {
        ok: true, provider: 'mangofy',
        vendaId: 'mg-' + (mg.payment_code || ''),
        status: mg.payment_status || 'pending',
        valor, simulada: false,
        pixQrCode: mgPix.pix_qrcode_image || null,
        pixCopiaECola: codigo,
        pixExpiresAt: mgPix.pix_expires_at || null
      });
    } catch (e) {
      if (e instanceof HttpError && (e.status === 400 || e.status === 500)) throw e;
      // segue para a Medusa como fallback
    }
  }

  const payloadMedusa = {
    paymentMethod: 'pix',
    amount: centavos,
    customer: {
      name: nome, email,
      phone: telefone.length >= 10 ? telefone : '11999999999',
      document: { number: cpf, type: cpf.length === 14 ? 'cnpj' : 'cpf' }
    },
    items: [{ title: produto, description: produto, unitPrice: centavos, quantity: 1, tangible: true }],
    shipping: { address: {
      street: String(end.endereco || '').trim(),
      streetNumber: String(end.numero || '').trim(),
      zipCode: digits(end.cep),
      neighborhood: String(end.bairro || '').trim(),
      city: String(end.cidade || '').trim(),
      state: String(end.uf || '').trim().toUpperCase(),
      country: 'BR',
      complement: String(end.complemento || '').trim()
    } },
    externalRef: String(pedido.orderId || '').trim() || undefined
  };

  try {
    const resp = await medusa(env, 'POST', '/transactions', payloadMedusa);
    const tx = resp.transaction || {};
    const codigo = tx.pix && tx.pix.qrcode;
    if (!codigo) throw new HttpError(502, resp.message || resp.error || 'Não foi possível gerar o Pix. Tente novamente.', 'PIX_INDISPONIVEL');
    return json(200, {
      ok: true, provider: 'medusa',
      vendaId: 'md-' + String(tx.id || resp.insertId || ''),
      status: tx.status || 'waiting_payment',
      valor, simulada: false,
      pixQrCode: null,
      pixCopiaECola: codigo,
      pixExpiresAt: (tx.pix && tx.pix.expirationDate) || null
    });
  } catch (medusaErr) {
    try {
      const mg = await mangofy(env, 'POST', '/api/v1/payment', payloadMg);
      const mgPix = mg.pix || (mg.data && mg.data.pix) || {};
      const codigo = mgPix.pix_qrcode_text;
      if (!codigo) throw new HttpError(502, (mg.message || medusaErr.message || 'Não foi possível gerar o Pix. Tente novamente.'), 'PIX_INDISPONIVEL');
      return json(200, {
        ok: true, provider: 'mangofy',
        vendaId: 'mg-' + (mg.payment_code || (mg.data && mg.data.payment_code) || ''),
        status: mg.payment_status || (mg.data && mg.data.payment_status) || 'pending',
        valor, simulada: false,
        pixQrCode: mgPix.pix_qrcode_image || null,
        pixCopiaECola: codigo,
        pixExpiresAt: mgPix.pix_expires_at || null
      });
    } catch (e) {
      const err = e instanceof HttpError ? e : new HttpError(502, medusaErr.message || 'Não foi possível gerar o Pix', 'PIX_INDISPONIVEL');
      return json(err.status, { ok: false, message: err.message, code: err.code });
    }
  }
}

async function statusPix(url, env) {
  const partes = new URL(url).pathname.split('/').filter(Boolean);
  let vid = decodeURIComponent(partes[partes.length - 1] || '');
  if (!/^[0-9a-zA-Z-]{6,80}$/.test(vid)) {
    return json(400, { ok: false, message: 'ID inválido' });
  }
  let usarMangofy;
  if (vid.startsWith('mg-') || vid.startsWith('pay') || vid.startsWith('mg')) {
    usarMangofy = true;
    vid = vid.replace(/^mg-/, '');
  } else if (vid.startsWith('md-')) {
    usarMangofy = false;
    vid = vid.slice(3);
  } else {
    usarMangofy = !/^\d+$/.test(vid);
  }
  try {
    let dados;
    if (usarMangofy) {
      dados = await mangofy(env, 'GET', '/api/v1/payment/' + encodeURIComponent(vid));
    } else {
      dados = await medusa(env, 'GET', '/transactions/' + encodeURIComponent(vid));
    }
    const tx = dados.transaction || dados.data || dados;
    const bruto = String(tx.status || tx.payment_status || '').toLowerCase();
    return json(200, {
      ok: true,
      vendaId: String(tx.id || tx.payment_code || vid),
      status: STATUS[bruto] || bruto,
      valor: typeof tx.amount === 'number' ? tx.amount / 100
             : typeof tx.payment_amount === 'number' ? tx.payment_amount / 100
             : tx.valor,
      metodo: tx.paymentMethod || tx.payment_method || 'pix',
      criadoEm: tx.createdAt || tx.created_at || null
    });
  } catch (e) {
    const err = e instanceof HttpError ? e : new HttpError(500, 'Erro interno no servidor');
    return json(err.status, { ok: false, message: err.message, code: err.code || '' });
  }
}

async function metaCapi(request, env) {
  const token = String(env.META_CAPI_TOKEN || '').trim();
  if (!token) return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
  let corpo;
  try {
    corpo = await request.json();
  } catch (e) {
    return json(400, { ok: false, message: 'JSON inválido' });
  }
  const eventName = String(corpo.event_name || '').trim().slice(0, 40);
  const eventId = String(corpo.event_id || '').trim().slice(0, 100);
  if (!eventName || !eventId) return json(400, { ok: false, message: 'event_name e event_id são obrigatórios' });
  const ud = corpo.user_data && typeof corpo.user_data === 'object' ? corpo.user_data : {};
  const evento = {
    event_name: eventName,
    event_time: Number(corpo.event_time) || Math.floor(Date.now() / 1000),
    event_id: eventId,
    event_source_url: String(corpo.event_source_url || '').slice(0, 2000),
    action_source: 'website',
    user_data: {
      client_ip_address: (request.headers.get('CF-Connecting-IP') || '').slice(0, 45),
      client_user_agent: (request.headers.get('User-Agent') || '').slice(0, 500),
      fbp: String(ud.fbp || '').slice(0, 200),
      fbc: String(ud.fbc || '').slice(0, 200)
    },
    custom_data: corpo.custom_data && typeof corpo.custom_data === 'object' ? corpo.custom_data : {}
  };
  const payload = { data: [evento] };
  if (env.META_TEST_EVENT_CODE) payload.test_event_code = env.META_TEST_EVENT_CODE;
  try {
    const r = await fetch(
      `https://graph.facebook.com/${cfg(env).graphVersion}/${cfg(env).pixelId}/events?access_token=${encodeURIComponent(token)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );
    const data = await r.json().catch(() => ({}));
    return json(r.ok ? 200 : 502, r.ok
      ? { ok: true, events_received: data.events_received || 1 }
      : { ok: false, message: (data.error && data.error.message) || 'Meta recusou o evento' });
  } catch (e) {
    return json(502, { ok: false, message: 'Falha ao enviar para a Meta' });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const caminho = url.pathname.replace(/\/+$/, '') || '/';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });

    if (caminho === '/api/health' && request.method === 'GET') {
      return json(200, { ok: true, servico: 'mercado-pix', medusa: Boolean(String(env.MEDUSA_API_KEY || '').trim()), mangofy: Boolean(String(env.MANGOFY_API_KEY || '').trim()) });
    }
    if (caminho === '/api/pix' && request.method === 'POST') {
      try {
        return await criarPix(request, env);
      } catch (e) {
        const err = e instanceof HttpError ? e : new HttpError(500, 'Erro interno no servidor');
        return json(err.status, { ok: false, message: err.message, code: err.code || '' });
      }
    }
    if (caminho.startsWith('/api/pix/') && request.method === 'GET') {
      return statusPix(url, env);
    }
    if (caminho === '/api/meta-capi' && request.method === 'POST') {
      return metaCapi(request, env);
    }
    if (caminho === '/api/postback' && (request.method === 'POST' || request.method === 'GET')) {
      try { await request.json(); } catch (e) {}
      return json(200, { ok: true });
    }
    return json(404, { ok: false, message: 'Rota não encontrada' });
  }
};
