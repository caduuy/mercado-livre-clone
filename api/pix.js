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
    const telefone = digits(pedido.clienteTelefone);
    const end = pedido.endereco || {};

    if (!(valor > 0)) throw new HttpError(400, 'Valor do pedido inválido', 'VALOR_INVALIDO');
    if (cpf.length !== 11 && cpf.length !== 14) {
      throw new HttpError(400, 'Informe um CPF (ou CNPJ) válido para gerar o Pix', 'CPF_INVALIDO');
    }
    if (!nome) throw new HttpError(400, 'Informe o nome do comprador', 'NOME_INVALIDO');
    if (email.indexOf('@') < 1) throw new HttpError(400, 'Informe um e-mail válido', 'EMAIL_INVALIDO');

    const centavos = Math.round(valor * 100);
    const uf = String(end.uf || '').trim().toUpperCase();
    const payload = {
      paymentMethod: 'pix',
      amount: centavos,
      customer: {
        name: nome,
        email,
        phone: telefone.length >= 10 ? telefone : '11999999999',
        document: { number: cpf, type: cpf.length === 14 ? 'cnpj' : 'cpf' }
      },
      items: [{
        title: produto,
        description: produto,
        unitPrice: centavos,
        quantity: 1,
        tangible: true
      }],
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
      externalRef: String(pedido.orderId || '').trim() || undefined
    };

    const resp = await medusa('POST', '/transactions', payload);
    const tx = resp.transaction || {};
    const codigo = tx.pix && tx.pix.qrcode;
    if (!codigo) {
      throw new HttpError(502, resp.message || resp.error || 'Não foi possível gerar o Pix. Tente novamente.', 'PIX_INDISPONIVEL');
    }
    const qr = await qrDataUrl(codigo);
    return json(res, 200, {
      ok: true,
      vendaId: String(tx.id || resp.insertId || ''),
      status: tx.status || 'waiting_payment',
      valor,
      simulada: false,
      pixQrCode: qr,
      pixCopiaECola: codigo,
      pixExpiresAt: tx.pix.expirationDate || null
    });
  } catch (e) {
    if (e instanceof HttpError) {
      return json(res, e.status, { ok: false, message: e.message, code: e.code });
    }
    console.error('erro inesperado em /api/pix', e);
    return json(res, 500, { ok: false, message: 'Erro interno no servidor' });
  }
};
