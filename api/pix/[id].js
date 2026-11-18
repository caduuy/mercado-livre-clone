const { HttpError, medusa, json } = require('../../lib/medusa');
const ID_RE = /^[0-9a-zA-Z-]{6,80}$/;

const STATUS = {
  waiting_payment: 'pendente',
  pending: 'pendente',
  processing: 'pendente',
  paid: 'aprovado',
  approved: 'aprovado',
  refused: 'recusado',
  refunded: 'estornado',
  canceled: 'recusado',
  cancelled: 'recusado',
  chargedback: 'estornado'
};

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { ok: false, message: 'Método não permitido' });
  }
  try {
    let vid = req.query && req.query.id;
    if (!vid) {
      const parts = String(req.url || '').split('?')[0].split('/');
      vid = decodeURIComponent(parts[parts.length - 1] || '');
    }
    if (!ID_RE.test(vid)) {
      return json(res, 400, { ok: false, message: 'ID inválido' });
    }
    const dados = await medusa('GET', '/transactions/' + encodeURIComponent(vid));
    const tx = dados.transaction || dados;
    const bruto = String(tx.status || '').toLowerCase();
    return json(res, 200, {
      ok: true,
      vendaId: String(tx.id || vid),
      status: STATUS[bruto] || bruto,
      valor: typeof tx.amount === 'number' ? tx.amount / 100 : tx.valor,
      metodo: tx.paymentMethod || 'pix',
      criadoEm: tx.createdAt || null
    });
  } catch (e) {
    if (e instanceof HttpError) {
      return json(res, e.status, { ok: false, message: e.message, code: e.code });
    }
    console.error('erro inesperado em /api/pix/:id', e);
    return json(res, 500, { ok: false, message: 'Erro interno no servidor' });
  }
};
