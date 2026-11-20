/* Meta Pixel — eventos do site (Pixel 1126035016737080)
 * O código base (init + PageView) é injetado no <head> de todas as páginas.
 * Este arquivo adiciona os eventos de e-commerce e envia uma cópia para a
 * Conversions API através de /api/meta-capi (token fica só no servidor).
 */
(function () {
  'use strict';

  var PIXEL_ID = '1126035016737080';
  var CURRENCY = 'BRL';
  var CAPI_PATH = 'https://mercado-pix.ce855272.workers.dev/api/meta-capi';
  var CART_KEY = 'achados_cart_v1';
  var LAST_ORDER_KEY = 'achados_ultimo_pedido';

  function readJSON(key, fallback) {
    try {
      var value = JSON.parse(localStorage.getItem(key));
      return value == null ? fallback : value;
    } catch (e) {
      return fallback;
    }
  }

  function parseMoney(text) {
    if (!text) return 0;
    var raw = String(text).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
    var value = parseFloat(raw);
    return isNaN(value) ? 0 : value;
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()[\]\\\/\+^]/g, '\\$&') + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : '';
  }

  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function fbqSafe() {
    if (typeof window.fbq === 'function') return window.fbq;
    var queue = window.fbq = function () {
      if (queue.callMethod) queue.callMethod.apply(queue, arguments);
      else queue.queue.push(arguments);
    };
    if (!window._fbq) window._fbq = queue;
    queue.push = queue;
    queue.loaded = true;
    queue.version = '2.0';
    queue.queue = [];
    return queue;
  }

  function sendCAPI(eventName, params, eventId) {
    try {
      var payload = {
        event_name: eventName,
        event_id: eventId,
        event_time: Math.floor(Date.now() / 1000),
        event_source_url: location.href,
        action_source: 'website',
        user_data: {
          fbp: getCookie('_fbp'),
          fbc: getCookie('_fbc')
        },
        custom_data: params || {}
      };
      var body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(CAPI_PATH, new Blob([body], { type: 'application/json' }));
      } else {
        fetch(CAPI_PATH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          keepalive: true
        }).catch(function () {});
      }
    } catch (e) {
      /* nunca deixa o tracking quebrar a loja */
    }
  }

  function track(eventName, params, eventId) {
    var id = eventId || uid(eventName.toLowerCase());
    try {
      fbqSafe()('track', eventName, params || {}, { eventID: id });
    } catch (e) {}
    sendCAPI(eventName, params || {}, id);
    return id;
  }

  function cart() {
    var value = readJSON(CART_KEY, []);
    return Array.isArray(value) ? value.filter(function (item) {
      return item && item.nome;
    }) : [];
  }

  function toContents(items) {
    return (items || []).map(function (item) {
      return {
        id: String(item.id),
        quantity: Number(item.qty) || 1,
        item_price: Number(item.price) || 0
      };
    });
  }

  function cartValue(items) {
    return (items || []).reduce(function (total, item) {
      return total + (Number(item.price) || 0) * (Number(item.qty) || 1);
    }, 0);
  }

  function cartCount(items) {
    return (items || []).reduce(function (total, item) {
      return total + (Number(item.qty) || 1);
    }, 0);
  }

  function cartParams(items) {
    items = items || cart();
    return {
      contents: toContents(items),
      content_ids: items.map(function (item) { return String(item.id); }),
      content_type: 'product',
      num_items: cartCount(items),
      value: cartValue(items),
      currency: CURRENCY
    };
  }

  function readProduct() {
    if (window.LojaLocal && typeof window.LojaLocal.readProduct === 'function') {
      try {
        var product = window.LojaLocal.readProduct();
        if (product && product.nome) return product;
      } catch (e) {}
    }

    var match = location.pathname.match(/\/produto\/([^\/]+)\.html$/);
    var heading = document.querySelector('h1.titulo, h1.ml-produto-nome, h1');
    var name = heading ? heading.textContent.replace(/\s+/g, ' ').trim() : '';
    if (!name) name = String(document.title || '').replace(/\s*\|\s*Mercado Livre\s*$/i, '').trim();

    var price = 0;
    var integer = document.querySelector('.pdp-preco-inteiro');
    var cents = document.querySelector('.pdp-preco-cent');
    if (integer) {
      price = parseFloat(String(integer.textContent).replace(/\./g, '') + '.' + (cents ? String(cents.textContent).trim() : '00'));
    }
    if (!price) {
      var alt = document.querySelector('.pdp-preco-valor, .ml-info-preco, .poly-price__current');
      price = parseMoney(alt ? alt.textContent : '');
    }

    var image = document.querySelector('#imgPrincipal, .pdp-imagem img');
    var qty = parseInt((document.querySelector('#buyboxQtdSelect') || {}).value || '1', 10);

    return {
      id: match ? match[1] : '',
      nome: name,
      price: isNaN(price) ? 0 : price,
      img: image ? image.getAttribute('src') : '',
      qty: !qty || qty < 1 ? 1 : qty
    };
  }

  function productParams(product) {
    var id = String(product.id || product.nome);
    return {
      content_name: product.nome,
      content_ids: [id],
      content_type: 'product',
      contents: [{ id: id, quantity: Number(product.qty) || 1, item_price: Number(product.price) || 0 }],
      value: (Number(product.price) || 0) * (Number(product.qty) || 1),
      currency: CURRENCY
    };
  }

  function addToCart(product) {
    if (!product || !product.nome) return;
    track('AddToCart', productParams(product), 'atc_' + String(product.id || product.nome) + '_' + Date.now());
  }

  function searchTerm(pathname, query) {
    if (query) return query;
    var match = pathname.match(/\/busca\/q-(.+)\.html$/);
    if (!match) return '';
    try {
      return decodeURIComponent(match[1]).replace(/-/g, ' ');
    } catch (e) {
      return match[1].replace(/-/g, ' ');
    }
  }

  function init() {
    var path = location.pathname;

    if (/\/produto\/[^\/]+\.html$/.test(path)) {
      var product = readProduct();
      if (product && (product.id || product.nome)) {
        track('ViewContent', productParams(product), 'vc_' + String(product.id || product.nome) + '_' + Date.now());
      }
    }

    if (/\/busca(\.html|\/)/.test(path)) {
      var query = '';
      try { query = new URLSearchParams(location.search).get('q') || ''; } catch (e) {}
      var term = searchTerm(path, query);
      if (term) track('Search', { search_string: term, currency: CURRENCY });
    }

    if (/\/carrinho\.html$/.test(path)) {
      var cartItems = cart();
      if (cartItems.length) track('ViewCart', cartParams(cartItems));
    }

    if (/\/checkout\.html$/.test(path)) {
      var checkoutItems = cart();
      if (checkoutItems.length) track('InitiateCheckout', cartParams(checkoutItems));

      var form = document.getElementById('ll-form');
      if (form) {
        form.addEventListener('submit', function () {
          var items = cart();
          if (!items.length) return;
          var methodField = form.querySelector('input[name=metodo]:checked');
          var params = cartParams(items);
          params.payment_method = methodField ? methodField.value : 'pix';
          track('AddPaymentInfo', params);
        });
      }
    }

    if (/\/pedido-confirmado\.html$/.test(path)) {
      var order = readJSON(LAST_ORDER_KEY, null);
      if (order && order.itens && order.itens.length) {
        var flag = 'meta_purchase_' + order.id;
        if (!localStorage.getItem(flag)) {
          var params = cartParams(order.itens);
          params.order_id = String(order.id || '');
          params.payment_method = order.metodo || 'pix';
          track('Purchase', params, 'purchase_' + String(order.id));
          try { localStorage.setItem(flag, '1'); } catch (e) {}
        }
      }
    }
  }

  window.MetaPixel = {
    pixelId: PIXEL_ID,
    track: track,
    addToCart: addToCart,
    readProduct: readProduct,
    cart: cart,
    cartParams: cartParams
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
