const { HttpError, medusa, qrDataUrl, json, digits, readBody } = require('../lib/medusa');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, message: 'Método não permitido' });
  }
  try {
    const pedido = await readBody(req);
    const valor = Math.round((Number(pedido.valor) || 0) * 100) / 100;
    const cpf = digits(pedido.clienteCpf);
    const nome = String(pedido.clienteNome || '').trim();
    const email = String(pedido.clienteEmail || '').trim();
    const produto = String(pedido.produto || 'Pedido').trim().slice(0, 200);
    let idem = String(pedido.orderId || '').trim();

    if (!(valor > 0)) throw new HttpError(400, 'Valor do pedido inválido', 'VALOR_INVALIDO');
    if (cpf.length !== 11 && cpf.length !== 14) {
      throw new HttpError(400, 'Informe um CPF (ou CNPJ) válido para gerar o Pix', 'CPF_INVALIDO');
    }
    if (!nome) throw new HttpError(400, 'Informe o nome do comprador', 'NOME_INVALIDO');
    if (email.indexOf('@') < 1) throw new HttpError(400, 'Informe um e-mail válido', 'EMAIL_INVALIDO');
    if (idem.length < 8) idem = 'pedido-' + (idem || 'anon') + '-clone';

    const util = {
      clienteNome: nome,
      clienteEmail: email,
      clienteCpf: cpf,
      produto,
      valor,
      metodo: 'PIX',
      idempotencyKey: idem
    };

    const resp = await medusa('POST', '/pagamentos', util);
    const venda = resp.venda || {};
    const dadosPix = venda.dadosPix || {};
    const codigo = resp.pixCopiaECola || dadosPix.copiaECola;
    let qr = resp.pixQrCode || dadosPix.qrCode;
    const expira = resp.pixExpiresAt || dadosPix.expiresAt;

    if (!codigo) {
      throw new HttpError(502, resp.message || 'A Medusa não retornou o código Pix', 'PIX_INDISPONIVEL');
    }
    if (!qr) qr = await qrDataUrl(codigo);

    return json(res, 200, {
      ok: true,
      vendaId: venda.id,
      status: venda.status,
      valor: venda.valor,
      simulada: Boolean(venda.simulada),
      idempotente: Boolean(resp.idempotente),
      pixPendente: resp.pixPendente,
      pixQrCode: qr,
      pixCopiaECola: codigo,
      pixExpiresAt: expira,
      valorLiquido: resp.valorLiquido || venda.valorLiquido,
      taxaAdmin: resp.taxaAdmin
    });
  } catch (e) {
    if (e instanceof HttpError) {
      return json(res, e.status, { ok: false, message: e.message, code: e.code });
    }
    console.error('erro inesperado em /api/pix', e);
    return json(res, 500, { ok: false, message: 'Erro interno no servidor' });
  }
};
