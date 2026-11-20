# Achados do Dia — clone com checkout e Pix real

Site estático (491 páginas) + duas funções serverless na Vercel que falam com a
Medusa Payments. O checkout (carrinho, dados, frete, Pix/cartão/boleto e
confirmação) roda 100% no navegador; só o Pix passa pelo backend para não expor
a API Key.

## Estrutura

```
index.html, produto/, busca/, assets/ ...   site clonado
api/pix.js                                  POST /api/pix (cria cobrança)
api/pix/[id].js                             GET  /api/pix/:id (consulta status)
api/health.js                               GET  /api/health
lib/medusa.js                               cliente Medusa + geração do QR
package.json                                dependência qrcode
```

As imagens **não** estão no repositório: os HTMLs apontam para o CDN público
`https://http2.mlstatic.com/...` (o clone local tinha ~81 MB de mídia, o que
estoura o limite de 100 MB de upload do plano Hobby da Vercel).

## Deploy na Vercel

1. Suba este repositório no GitHub (já feito) e na Vercel clique em
   **Add New → Project → Import Git Repository**.
2. Framework preset: **Other**. Build Command: vazio. Output Directory: vazio
   (a raiz do repo é o site). Root Directory: `./`.
3. Em **Environment Variables**, adicione (Production + Preview):

   | Nome | Valor |
   | --- | --- |
   | `MEDUSA_API_KEY` | sua chave `mk_live_...` |
   | `MEDUSA_ACCOUNT_ID` | id da conta Medusa |
   | `MEDUSA_BASE_URL` | `https://api.medusapayments.com/v1` |

   A chave está em `/Users/cadu/checkout_local/.medusa.env` na sua máquina.
   **Não** commite esse arquivo (ele está no `.gitignore`).
4. Deploy. Depois abra `https://SEU-PROJETO.vercel.app/api/health` — deve
   retornar `{"ok":true,"medusa":true}`.
5. Teste o fluxo: produto → adicionar ao carrinho → checkout → Pix.

> Sem as variáveis de ambiente o site abre, mas `/api/pix` responde
> `SEM_CHAVE` e a tela de pagamento mostra o erro com botão de tentar de novo.

## Rodar localmente

Com a Vercel CLI (emula as funções):

```bash
npm install
npx vercel dev
```

Ou usando o servidor Python original (fora deste repo, em
`checkout_local/servidor.py`):

```bash
python3 checkout_local/servidor.py --clone /Users/cadu/achados_clone --port 8765
```

## Avisos

- O Pix é **real**: cada checkout gera uma cobrança de verdade na conta Medusa.
  Valores de teste ficam pendentes e não há endpoint de cancelamento documentado.
- A API Key foi colada em um chat; recomendo **rotacionar** a chave no painel da
  Medusa e atualizar a variável na Vercel.
- Conteúdo e imagens pertencem ao site original; use apenas para estudo/demo.

## Mangofy (Pix até R$ 400)

O roteador envia para a **Mangofy** quando o total do pedido é **≤ R$ 400** (configurável via `PIX_MAX_MANGOFY`).
Acima disso, cai na **Medusa**.

| Variável | Descrição |
|---|---|
| `MANGOFY_API_KEY` | Chave da credencial de plataforma (header Authorization) |
| `MANGOFY_STORE_CODE` | Store Code gerado em Integrações > API customizada |
| `MANGOFY_BASE_URL` | URL base (padrão: `https://whitelabel-checkout.test`) |
| `PIX_MAX_MANGOFY` | Limite em reais (padrão: 400) |

Doc: https://app.mangofy.com.br/checkout/doc

## Meta Pixel / Conversions API

O Pixel `1126035016737080` está instalado em **todas as 511 páginas** do site.
Eventos disparados:

| Evento | Onde |
|---|---|
| `PageView` | todas as páginas |
| `ViewContent` | páginas de produto |
| `Search` | páginas de busca |
| `ViewCart` | carrinho |
| `AddToCart` | clique em comprar/adicionar |
| `InitiateCheckout` | abertura do checkout |
| `AddPaymentInfo` | envio do checkout com a forma de pagamento |
| `Purchase` | pedido confirmado (uma vez por pedido) |

O navegador envia uma cópia para `/api/meta-capi` (Conversions API) com o
mesmo `event_id`, para deduplicação. O token **não** fica no HTML.

| Variável | Descrição |
|---|---|
| `META_PIXEL_ID` | `1126035016737080` |
| `META_CAPI_TOKEN` | token da Conversions API (nunca commitar) |
| `META_GRAPH_VERSION` | versão da Graph API (padrão `v21.0`) |
| `META_TEST_EVENT_CODE` | opcional, só para testar no Events Manager |

Sem `META_CAPI_TOKEN` o endpoint responde `204` e o pixel do navegador continua
funcionando normalmente. Localmente, as variáveis ficam em `.env.local`
(ignorado pelo Git). Na Vercel, cadastre em **Settings → Environment Variables**.

> O Pixel mede o tráfego do **site**. O Facebook Marketplace não aceita código
> de pixel dentro dos anúncios; para catálogo de produtos no Marketplace é
> preciso criar um feed no Commerce Manager.

