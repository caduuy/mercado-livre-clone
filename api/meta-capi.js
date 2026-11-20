/* Proxy da Conversions API da Meta.
 * O token fica apenas nas variáveis de ambiente do servidor (nunca no HTML).
 * Configure na Vercel:
 *   META_PIXEL_ID=1126035016737080
 *   META_CAPI_TOKEN=EA...
 */
const PIXEL_ID = process.env.META_PIXEL_ID || '1126035016737080';
const TOKEN = process.env.META_CAPI_TOKEN || '';
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 64 * 1024) {
        reject(new Error('Payload muito grande'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sameOrigin(req) {
  const source = req.headers.origin || req.headers.referer || '';
  if (!source) return true;
  try {
    return new URL(source).host === req.headers.host;
  } catch (error) {
    return false;
  }
}

function clean(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    json(res, 204, {});
    return;
  }
  if (req.method !== 'POST') {
    json(res, 405, { ok: false, message: 'Método não permitido' });
    return;
  }
  if (!TOKEN) {
    json(res, 204, { ok: true, skipped: 'META_CAPI_TOKEN não configurado' });
    return;
  }
  if (!sameOrigin(req)) {
    json(res, 403, { ok: false, message: 'Origem não permitida' });
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    json(res, 400, { ok: false, message: 'JSON inválido' });
    return;
  }

  const eventName = clean(body.event_name, 40);
  const eventId = clean(body.event_id, 100);
  if (!eventName || !eventId) {
    json(res, 400, { ok: false, message: 'event_name e event_id são obrigatórios' });
    return;
  }

  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const userData = body.user_data && typeof body.user_data === 'object' ? body.user_data : {};
  const event = {
    event_name: eventName,
    event_time: Number(body.event_time) || Math.floor(Date.now() / 1000),
    event_id: eventId,
    event_source_url: clean(body.event_source_url, 2000),
    action_source: 'website',
    user_data: {
      client_ip_address: forwarded || req.socket.remoteAddress || '',
      client_user_agent: clean(req.headers['user-agent'], 500),
      fbp: clean(userData.fbp, 200),
      fbc: clean(userData.fbc, 200)
    },
    custom_data: body.custom_data && typeof body.custom_data === 'object' ? body.custom_data : {}
  };

  const payload = { data: [event] };
  if (process.env.META_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.META_TEST_EVENT_CODE;
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events?access_token=${encodeURIComponent(TOKEN)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.warn('[meta-capi]', data && data.error ? data.error.message : response.status);
      json(res, 502, { ok: false, message: 'Meta recusou o evento' });
      return;
    }
    json(res, 200, { ok: true, events_received: data.events_received || 1 });
  } catch (error) {
    console.error('[meta-capi]', error.message || error);
    json(res, 502, { ok: false, message: 'Falha ao enviar para a Meta' });
  }
};
