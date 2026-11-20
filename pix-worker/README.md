# Worker do Pix (Cloudflare)

O checkout chama este serviço para gerar e consultar cobranças Pix
(Mangofy ≤ R$ 400, Medusa acima, com fallback). Já publicado em:

https://mercado-pix.ce855272.workers.dev

As chaves ficam salvas como **secrets** da Cloudflare (nunca no repo/site).

## Redeploy / trocar chaves

```bash
cd pix-worker
npx wrangler secret put MANGOFY_API_KEY      # cole o valor
npx wrangler secret put MANGOFY_STORE_CODE
npx wrangler secret put MEDUSA_API_KEY
npx wrangler secret put MANGOFY_BASE_URL     # https://checkout.mangofy.com.br
npx wrangler secret put MEDUSA_BASE_URL      # https://api.medusapayments.com/v1
npx wrangler secret put PIX_MAX_MANGOFY      # 400
npx wrangler secret put META_CAPI_TOKEN      # token da Conversions API
npx wrangler deploy
```

Rotas: `GET /api/health` · `POST /api/pix` · `GET /api/pix/:id` ·
`POST /api/meta-capi` · `POST /api/postback` (Mangofy).
