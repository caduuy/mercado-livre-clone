# Guia de hospedagem — Clone Mercado Livre (FINAL)

Pacote **pronto para publicar**. Nada precisa ser configurado nem editado.

## ⚡ Como publicar (ShockHosting — do mesmo jeito que você já faz)

1. Descompacte o ZIP.
2. Suba o conteúdo na hospedagem (LiteSpeed), como já feito antes.
3. **Pronto.** Não precisa de Vercel, não precisa de variável de ambiente, não precisa mexer em nada.

## Por que o Pix funciona agora

O site é estático, mas o Pix é gerado por um **serviço separado já publicado e configurado**:

```
https://mercado-pix.ce855272.workers.dev
```

- Roda na **Cloudflare Workers** (conta ce855272@gmail.com, gratuita).
- As chaves da **Mangofy** e da **Medusa** ficam salvas como **segredos da Cloudflare** — por isso **não vão dentro deste ZIP**.
- Pedidos **até R$ 400** → Mangofy. Acima disso → Medusa. Se a Medusa falhar → cai na Mangofy.
- O QR Code do Pix é gerado **no navegador** (`assets/js/qrcode.min.js`) a partir do código copia-e-cola oficial.
- A Conversions API do Meta Pixel também passa pelo mesmo serviço.

### Checagem rápida (opcional)

`https://mercado-pix.ce855272.workers.dev/api/health` deve responder:

```json
{"ok":true,"servico":"mercado-pix","medusa":true,"mangofy":true}
```

Se um dia precisar trocar chaves: na pasta `mercado-pix-worker`, rode
`npx wrangler secret put MANGOFY_API_KEY` (idem para as outras) e `npx wrangler deploy`.

## O que está incluído

| Item | Status |
|---|---|
| 511 páginas (home, categorias, buscas, produto, carrinho, checkout, pagamento, confirmação) | ✅ |
| 92 produtos com galeria e miniaturas corrigidas (bug da URL `../https://` resolvido) | ✅ |
| Coleção natalina completa com fotos locais + preços atualizados | ✅ |
| Cortina LED RGB (produto 127): 8 fotos novas, R$ 79,99, sem variações | ✅ |
| Meta Pixel `1126035016737080` em todas as páginas + eventos (ViewContent, AddToCart, InitiateCheckout, AddPaymentInfo, Purchase) | ✅ |
| Pix (Mangofy/Medusa) + QR real + consulta de status | ✅ testado ponta a ponta |
| Conversions API (via servidor) | ✅ |
| `api/*.js` originais (para Vercel) | ✅ incluídos, mas não são usados nesta hospedagem |

## Checklist pós-upload

1. Abra a home — logos e banners carregam.
2. Abra um produto — fotos principal e miniaturas OK.
3. Compre um produto → checkout → **Pix**: o QR e o código copia-e-cola aparecem (cobrança real).
4. No Events Manager da Meta, veja `PageView` / `ViewContent` / `Purchase` chegando.

## Observações

- Cobranças de teste geradas durante a validação ficam **pendentes** no painel da Mangofy — podem ser ignoradas/canceladas.
- As imagens dos produtos comuns seguem do CDN público `mlstatic.com` (testadas); as críticas são locais.
- Chaves de pagamento **nunca** vão em ZIP/chat; se precisar repassar, use canal privado.
