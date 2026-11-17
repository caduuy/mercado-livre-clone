# Clone offline — https://achadosdodia.site

Gerado por clone_achados.py em 2026-11-17 10:04:01

- Paginas HTML: 491 (77 produtos)
- Arquivos totais baixados: 2111
- Tamanho: 133.2 MB

## Como abrir
Abra `index.html` no navegador (funciona em file://). O checkout aponta para
`acoes/*.php` e nao funciona offline — o restante da navegacao e visualizacao funciona.

## Estrutura
- `index.html` — home
- `busca/` — listagens por categoria/marca/busca
- `produto/<id>.html` — paginas de produto
- `assets/` — CSS, fontes, logos e imagens do proprio site
- `media/` — imagens externas (http2.mlstatic.com), se --images
- `_relatorio.csv` — URL -> arquivo -> status

## Checkout local

Fluxo funcional sem servidor: `carrinho.html` -> `checkout.html` -> `pagamento.html`
(Pix, cartao ou boleto) -> `pedido-confirmado.html`.
O carrinho fica no localStorage (`achados_cart_v1`) e os botoes "Comprar agora" /
"Adicionar ao carrinho" sao interceptados por `assets/js/loja-local.js`.
Pagamento simulado: nada e cobrado nem enviado.
