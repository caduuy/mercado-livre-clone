(function () {
  var s = document.currentScript;
  var ROOT = (s && s.getAttribute('data-root')) || '';
  var CART = 'achados_cart_v1';
  var ORDER = 'achados_pedido_v1';
  var LAST = 'achados_ultimo_pedido';

  function brl(v) {
    return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function parseMoney(t) {
    if (!t) return 0;
    var m = String(t).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
    var v = parseFloat(m);
    return isNaN(v) ? 0 : v;
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(CART)) || []; } catch (e) { return []; }
  }
  function save(c) { localStorage.setItem(CART, JSON.stringify(c)); badge(); }
  function clear() { localStorage.removeItem(CART); badge(); }
  function count() { return load().reduce(function (a, i) { return a + (i.qty || 1); }, 0); }
  function subtotal() { return load().reduce(function (a, i) { return a + i.price * (i.qty || 1); }, 0); }

  function toRoot(u) {
    if (!u) return '';
    if (/^(https?:|data:)/.test(u)) return u;
    if (ROOT && u.indexOf(ROOT) === 0) return u.slice(ROOT.length);
    if (u.charAt(0) === '/') return u.replace(/^\/+/, '');
    return u.replace(/^(\.\/)+/, '');
  }

  function readField(sel) {
    var el = document.querySelector(sel);
    return el ? (el.value || '').trim() : '';
  }

  function readProduct() {
    var m = location.pathname.match(/produto\/([^\/]+)\.html/);
    var nome = (document.querySelector('h1.titulo') || document.querySelector('h1') || {}).textContent || document.title;
    var inteiro = document.querySelector('.pdp-preco-inteiro');
    var cent = document.querySelector('.pdp-preco-cent');
    var price = 0;
    if (inteiro) {
      price = parseFloat(String(inteiro.textContent).replace(/\./g, '') + '.' + (cent ? String(cent.textContent).trim() : '00'));
    }
    if (!price) {
      var alt = document.querySelector('.pdp-preco-valor, .ml-info-preco');
      price = parseMoney(alt ? alt.textContent : '');
    }
    var antigo = document.querySelector('.pdp-preco-antigo');
    var img = document.querySelector('#imgPrincipal');
    var vars = [];
    document.querySelectorAll('.var-label').forEach(function (lbl) {
      var b = lbl.querySelector('.var-selecionada');
      if (!b) return;
      var nomeVar = (lbl.textContent.split(':')[0] || '').trim();
      vars.push(nomeVar + ': ' + b.textContent.trim());
    });
    var qtd = parseInt(readField('#buyboxQtdSelect') || readField('#mobQtdSelect') || '1', 10);
    if (!qtd || qtd < 1) qtd = 1;
    return {
      id: m ? m[1] : String(Date.now()),
      nome: nome.trim().replace(/\s+/g, ' '),
      price: price,
      old: parseMoney(antigo ? antigo.textContent : ''),
      img: toRoot(img ? img.getAttribute('src') : ''),
      url: toRoot(location.pathname),
      variacoes: vars.join(' · '),
      qty: qtd
    };
  }

  function add(item) {
    var cart = load();
    var key = item.id + '|' + (item.variacoes || '');
    var found = cart.filter(function (i) { return (i.id + '|' + (i.variacoes || '')) === key; })[0];
    if (found) {
      found.qty = (found.qty || 1) + (item.qty || 1);
    } else {
      cart.push(item);
    }
    save(cart);
    return cart;
  }
  function setQty(idx, q) {
    var cart = load();
    if (!cart[idx]) return;
    cart[idx].qty = Math.max(1, Math.min(99, q | 0));
    save(cart);
  }
  function remove(idx) {
    var cart = load();
    cart.splice(idx, 1);
    save(cart);
  }

  function badge() {
    var n = count();
    document.querySelectorAll('.ml-carrinho, .ll-cart, .ml-produto-topo-mobile-carrinho').forEach(function (el) {
      var b = el.querySelector('.ll-badge');
      if (!b) {
        b = document.createElement('span');
        b.className = 'll-badge';
        el.appendChild(b);
      }
      b.textContent = n;
      b.hidden = n === 0;
      if (n > 0 && !el.dataset.llNoPop) {
        b.classList.remove('ll-pop');
        void b.offsetWidth;
        b.classList.add('ll-pop');
      }
    });
  }

  function toast(msg) {
    var t = document.getElementById('ll-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'll-toast';
      t.className = 'll-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove('on'); }, 2600);
  }

  function setupStepper(selId, numId, row) {
    var sel = document.getElementById(selId);
    var num = document.getElementById(numId);
    if (!sel || !row || row.dataset.llStepper) return;
    row.dataset.llStepper = '1';
    var opts = Array.prototype.slice.call(sel.options);
    var max = opts.length ? parseInt(opts[opts.length - 1].value, 10) : 10;
    sel.style.pointerEvents = 'none';
    sel.style.opacity = '0';
    sel.style.position = 'absolute';
    sel.style.width = '0';
    sel.style.height = '0';
    sel.tabIndex = -1;
    var chev = row.querySelector(':scope > svg, :scope > .ml-buybox-qtd-chevron');
    if (chev) chev.style.display = 'none';
    var box = document.createElement('div');
    box.className = 'll-stepper';
    box.innerHTML =
      '<button type="button" data-dir="-1" aria-label="Diminuir quantidade">\u2212</button>' +
      '<span class="ll-step-val">' + (sel.value || 1) + '</span>' +
      '<button type="button" data-dir="1" aria-label="Aumentar quantidade">+</button>';
    row.appendChild(box);
    function sync(v) {
      v = Math.max(1, Math.min(max, v));
      sel.value = String(v);
      var val = box.querySelector('.ll-step-val');
      val.textContent = v;
      val.classList.remove('ll-pop');
      void val.offsetWidth;
      val.classList.add('ll-pop');
      if (num) num.textContent = v;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    box.addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-dir]');
      if (!b) return;
      ev.preventDefault();
      ev.stopPropagation();
      sync((parseInt(sel.value, 10) || 1) + parseInt(b.dataset.dir, 10));
    });
    if (num) num.textContent = sel.value || 1;
  }

  function initPdp() {
    setupStepper('buyboxQtdSelect', 'buyboxQtdNum', document.getElementById('buyboxQtdRow'));
    var mobSel = document.getElementById('mobQtdSelect');
    setupStepper('mobQtdSelect', 'mobQtdNum',
      mobSel ? (mobSel.previousElementSibling || mobSel.parentElement) : null);
  }

  document.addEventListener('click', function (ev) {
    var btn = ev.target && ev.target.closest
      ? ev.target.closest('form.form-compra-direta button[type="submit"], form[action*="carrinho-add"] button[type="submit"]')
      : null;
    if (!btn) return;
    var form = btn.closest('form');
    if (!form) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    comprar(btn);
  }, true);

  function comprar(btn) {
    var item = readProduct();
    add(item);
    try { if (window.MetaPixel) window.MetaPixel.addToCart(item); } catch (e) {}
    try { sessionStorage.setItem('ll_added', '1'); } catch (e) {}
    var overlay = document.getElementById('compraLoading');
    var titulo = document.getElementById('compraLoadingTitulo');
    if (overlay) {
      if (titulo) titulo.textContent = 'Adicionando ao carrinho...';
      overlay.hidden = false;
      document.body.classList.add('ml-loading-open');
    }
    if (btn) {
      btn.dataset.llOld = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Adicionando...';
    }
    setTimeout(function () { location.href = ROOT + 'carrinho.html'; }, 1150);
  }

  document.addEventListener('submit', function (ev) {
    var f = ev.target;
    if (!f || !f.getAttribute) return;
    var act = f.getAttribute('action') || '';
    if (!(f.classList.contains('form-compra-direta') || act.indexOf('carrinho-add') >= 0)) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    comprar(null);
  }, true);

  document.addEventListener('DOMContentLoaded', function () { badge(); initPdp(); });
  if (document.readyState !== 'loading') badge();

  window.LojaLocal = {
    brl: brl, parseMoney: parseMoney, load: load, save: save, clear: clear,
    count: count, subtotal: subtotal, add: add, setQty: setQty, remove: remove,
    toRoot: toRoot, badge: badge, toast: toast, initPdp: initPdp,
    keys: { cart: CART, order: ORDER, last: LAST }
  };
})();
