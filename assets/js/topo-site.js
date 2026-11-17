(function () {
  window.openWithWhiteSpinnerLink = function (link) {
    var dest = link.getAttribute('data-href') || link.getAttribute('href');
    if (dest && dest !== '#') location.href = dest;
    return false;
  };

  function cepSalvo() {
    try { return localStorage.getItem('ml_cep') || ''; } catch (e) { return ''; }
  }

  function pintaCep(cep) {
    if (!cep || cep.length !== 8) return;
    var txt = cep.slice(0, 5) + '-' + cep.slice(5);
    document.querySelectorAll('[data-cep-trigger]').forEach(function (b) {
      var alvo = b.querySelector('.ml-cat-texto') || b.querySelectorAll('span')[1];
      if (alvo) alvo.textContent = txt;
    });
  }

  document.addEventListener('click', function (ev) {
    var gatilho = ev.target.closest && ev.target.closest('[data-cep-trigger]');
    if (!gatilho) return;
    ev.preventDefault();
    var atual = cepSalvo();
    var cep = window.prompt('Informe seu CEP para calcular o frete e o prazo:', atual);
    if (cep === null) return;
    cep = cep.replace(/\D/g, '').slice(0, 8);
    if (cep.length !== 8) { window.alert('CEP inválido. Informe os 8 dígitos.'); return; }
    try { localStorage.setItem('ml_cep', cep); } catch (e) {}
    pintaCep(cep);
  });

  function init() {
    pintaCep(cepSalvo());

    var botao = document.querySelector('.ml-produto-topo-mobile-menu');
    var painel = document.getElementById('ml-produto-menu');
    if (!botao || !painel) return;

    var iconHamb = botao.querySelector('.icon-hamburguer');
    var iconFechar = botao.querySelector('.icon-fechar');
    botao.addEventListener('click', function () {
      var aberto = botao.getAttribute('aria-expanded') === 'true';
      botao.setAttribute('aria-expanded', String(!aberto));
      painel.hidden = aberto;
      if (iconHamb) iconHamb.style.display = aberto ? '' : 'none';
      if (iconFechar) iconFechar.style.display = aberto ? 'none' : '';
      botao.setAttribute('aria-label', aberto ? 'Abrir menu' : 'Fechar menu');
    });
    painel.addEventListener('click', function (ev) {
      if (ev.target.closest('a')) painel.hidden = true;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
