const { HttpError, medusa, json } = require('../../lib/medusa');

const UUID_RE = /^[0-9a-fA-F-]{8,64}$/;

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
    if (!UUID_RE.test(vid)) {
      return json(res, 400, { ok: false, message: 'ID inválido' });
    }
    const dados = await medusa('GET', '/pagamentos/' + encodeURIComponent(vid));
    return json(res, 200, {
      ok: true,
      vendaId: dados.id,
      status: dados.status,
      valor: dados.valor,
      valorLiquido: dados.valorLiquido,
      metodo: dados.metodo,
      criadoEm: dados.criadoEm
    });
  } catch (e) {
    if (e instanceof HttpError) {
      return json(res, e.status, { ok: false, message: e.message, code: e.code });
    }
    console.error('erro inesperado em /api/pix/:id', e);
    return json(res, 500, { ok: false, message: 'Erro interno no servidor' });
  }
};
