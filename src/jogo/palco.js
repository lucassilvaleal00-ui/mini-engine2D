/**
 * palco.js — A área de teste: roda o jogo num <iframe sandbox="allow-scripts"> SEM allow-same-origin.
 *
 * Assim o código escrito pela IA não consegue ler o localStorage do app (onde ficam as chaves de API)
 * nem o banco de dados. O jogo conversa com o app só por postMessage: erros, logs, pausar e continuar.
 */

import { h } from '../ui/dom.js';

/** JSON seguro dentro de <script>: nada de "</script>" ou "<!--" no meio. */
const jsonSeguro = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** Ordem de carga: .js em ordem alfabética, main.js por último. */
export function ordemDosScripts(arquivos) {
  return Object.keys(arquivos).filter((n) => n.endsWith('.js'))
    .sort((a, b) => (a === 'main.js') - (b === 'main.js') || a.localeCompare(b));
}

/** Monta o HTML completo do jogo (sem DOM; testável). */
export function montarHtmlDoJogo({ arquivos, assets, urlPhaser }) {
  const scripts = ordemDosScripts(arquivos).map((nome) => ({ nome, codigo: arquivos[nome] }));
  const dados = {};
  for (const [nome, texto] of Object.entries(arquivos)) {
    if (!nome.endsWith('.json')) continue;
    try { dados[nome] = JSON.parse(texto); } catch { dados[nome] = null; }
  }
  const sprites = assets.sprites.map(({ key, url, frameWidth, frameHeight, frames, fps }) => ({ key, url, frameWidth, frameHeight, frames, fps }));
  const cenarios = Object.fromEntries(assets.cenarios.map((c) => [c.key, {
    largura: c.largura, altura: c.altura, grade: c.grade, niveis: c.niveis, objetos: c.objetos, solidos: c.solidos, mapa: c.mapa, celulaMapa: c.celulaMapa,
  }]));

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none}#jogo{position:fixed;inset:0}canvas{display:block}</style>
</head><body><div id="jogo"></div>
<script>
(function () {
  var enviar = function (m) { m.miniEngine = true; try { parent.postMessage(m, '*'); } catch (e) {} };
  var nomes = {};
  window.__nomesDosArquivos = nomes;
  var arquivoDe = function (url) { return nomes[url] || (url && url.indexOf('blob:') === 0 ? 'código do jogo' : url) || ''; };
  window.addEventListener('error', function (e) {
    if (e.target && e.target !== window && e.target.src) { enviar({ tipo: 'erro', mensagem: 'Não consegui carregar ' + (arquivoDe(e.target.src) || 'um arquivo') }); return; }
    enviar({ tipo: 'erro', mensagem: String(e.message || 'Erro'), arquivo: arquivoDe(e.filename), linha: e.lineno || 0, coluna: e.colno || 0 });
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason; enviar({ tipo: 'erro', mensagem: String((r && r.message) || r) });
  });
  ['log', 'warn', 'error'].forEach(function (nivel) {
    var original = console[nivel];
    console[nivel] = function () {
      var partes = [];
      for (var i = 0; i < arguments.length; i++) { var a = arguments[i]; try { partes.push(typeof a === 'string' ? a : JSON.stringify(a)); } catch (x) { partes.push(String(a)); } }
      enviar({ tipo: nivel === 'log' ? 'log' : nivel, mensagem: partes.join(' ').slice(0, 500) });
      try { original.apply(console, arguments); } catch (x) {}
    };
  });
  window.__jogos = [];
  window.addEventListener('message', function (e) {
    if (e.source !== parent || !e.data || !e.data.miniEngine) return;
    window.__jogos.forEach(function (g) {
      try {
        if (e.data.tipo === 'pausar') { g.loop && g.loop.sleep ? g.loop.sleep() : g.pause && g.pause(); if (g.sound) g.sound.pauseAll(); }
        if (e.data.tipo === 'continuar') { g.loop && g.loop.wake ? g.loop.wake() : g.resume && g.resume(); if (g.sound) g.sound.resumeAll(); }
      } catch (x) {}
    });
  });
  window.__enviar = enviar;
})();
</script>
<script src="${urlPhaser}"></script>
<script>
(function () {
  if (typeof Phaser === 'undefined') { window.__enviar({ tipo: 'erro', mensagem: 'O Phaser não carregou.' }); return; }
  var Original = Phaser.Game;
  Phaser.Game = function (config) {
    config = config || {};
    if (!config.parent) config.parent = 'jogo';
    if (config.banner === undefined) config.banner = false; // sem a propaganda do Phaser no console
    var jogo = new Original(config);
    window.__jogos.push(jogo);
    return jogo;
  };
  Phaser.Game.prototype = Original.prototype;
  window.ASSETS = { sprites: ${jsonSeguro(sprites)} };
  window.CENARIOS = ${jsonSeguro(cenarios)};
  window.DADOS = ${jsonSeguro(dados)};
  window.carregarAssets = function (cena) {
    ASSETS.sprites.forEach(function (s) { cena.load.spritesheet(s.key, s.url, { frameWidth: s.frameWidth, frameHeight: s.frameHeight }); });
    Object.keys(CENARIOS).forEach(function (k) {
      var n = CENARIOS[k].niveis || {};
      Object.keys(n).forEach(function (nivel) { cena.load.image(k + '__nivel' + nivel, n[nivel]); });
    });
  };
  window.montarCenario = function (cena, key) {
    var c = CENARIOS[key];
    if (!c) throw new Error('Cenário "' + key + '" não existe. Cenários disponíveis: ' + Object.keys(CENARIOS).join(', '));
    Object.keys(c.niveis || {}).forEach(function (nivel) {
      cena.add.image(0, 0, key + '__nivel' + nivel).setOrigin(0, 0).setDepth(Number(nivel) * 10);
    });
    // sólidos com física (se a cena tiver Arcade), mundo e câmera do tamanho do cenário
    var grupo = null;
    if (cena.physics && cena.physics.add) {
      grupo = cena.physics.add.staticGroup();
      c.solidos.forEach(function (s) {
        var z = cena.add.zone(s.x + s.largura / 2, s.y + s.altura / 2, s.largura, s.altura);
        cena.physics.add.existing(z, true);
        grupo.add(z);
      });
      cena.physics.world.setBounds(0, 0, c.largura, c.altura);
    } else {
      console.warn('montarCenario: a cena não tem física Arcade (physics: { default: "arcade" }); os sólidos não vão colidir.');
    }
    cena.cameras.main.setBounds(0, 0, c.largura, c.altura);
    var linhas = String(c.mapa || '').split('\\n');
    return {
      largura: c.largura, altura: c.altura, grade: c.grade,
      solidos: c.solidos.slice(), objetos: c.objetos.slice(), grupoSolidos: grupo,
      /** {x, y} no centro de uma célula vazia ("."), procurando a partir de baixo à esquerda */
      pontoLivre: function () {
        for (var y = linhas.length - 1; y >= 0; y--) for (var x = 0; x < linhas[y].length; x++) {
          if (linhas[y][x] === '.' && (y + 1 >= linhas.length || linhas[y + 1][x] !== '.')) return { x: (x + 0.5) * c.celulaMapa, y: (y + 0.5) * c.celulaMapa };
        }
        return { x: c.largura / 2, y: c.altura / 2 };
      },
      /** objetos com esse nome (ex.: 'moeda') */
      acharObjetos: function (nome) { return c.objetos.filter(function (o) { return o.nome.toLowerCase().indexOf(String(nome).toLowerCase()) >= 0; }); },
    };
  };
  window.criarAnimacoes = function (cena) {
    ASSETS.sprites.forEach(function (s) {
      if (s.frames > 1 && !cena.anims.exists(s.key)) {
        cena.anims.create({ key: s.key, frames: cena.anims.generateFrameNumbers(s.key, { start: 0, end: s.frames - 1 }), frameRate: s.fps, repeat: -1 });
      }
    });
  };
})();
</script>
<script>
(function () {
  var scripts = ${jsonSeguro(scripts)};
  var i = 0;
  var proximo = function () {
    if (i >= scripts.length) { window.__enviar({ tipo: 'pronto' }); return; }
    var s = scripts[i++];
    var url = URL.createObjectURL(new Blob([s.codigo + '\\n//# sourceURL=' + s.nome], { type: 'text/javascript' }));
    window.__nomesDosArquivos[url] = s.nome;
    var el = document.createElement('script');
    el.src = url;
    el.onload = proximo;
    el.onerror = proximo;
    document.body.appendChild(el);
  };
  proximo();
})();
</script>
</body></html>`;
}

/**
 * Cria a área de teste.
 * @param aoMensagem  ({ tipo: 'erro'|'log'|'warn'|'pronto', mensagem, arquivo, linha }) => void
 */
export function criarPalco({ aoMensagem }) {
  const moldura = h('div', { class: 'palco-moldura' });
  const capa = h('div', { class: 'palco-capa', role: 'status' });
  const el = h('div', { class: 'palco' }, moldura, capa);
  let iframe = null;
  let pausado = false;

  const ouvir = (e) => {
    if (!iframe || e.source !== iframe.contentWindow || !e.data?.miniEngine) return;
    aoMensagem?.(e.data);
  };
  window.addEventListener('message', ouvir);

  function mostrarCapa(tipo, texto) {
    capa.dataset.tipo = tipo || '';
    capa.hidden = !tipo;
    capa.replaceChildren(...(tipo ? [h('div', { class: 'palco-capa-icone', 'aria-hidden': 'true' }, tipo === 'bloqueado' ? '🔒' : '⏸'), h('p', {}, texto)] : []));
  }

  return {
    el,
    /** Roda (ou reinicia) o jogo. */
    rodar({ arquivos, assets }) {
      const urlPhaser = new URL('vendor/phaser.min.js', document.baseURI).href;
      const novo = h('iframe', {
        class: 'palco-iframe',
        title: 'Jogo em teste',
        sandbox: 'allow-scripts',
        allow: 'autoplay; fullscreen; gamepad',
      });
      novo.srcdoc = montarHtmlDoJogo({ arquivos, assets, urlPhaser });
      iframe?.remove();
      iframe = novo;
      moldura.append(novo);
      pausado = false;
      mostrarCapa(null);
    },
    parar() { iframe?.remove(); iframe = null; },
    pausar(texto = 'A IA está trabalhando… o jogo fica pausado.') {
      pausado = true;
      iframe?.contentWindow?.postMessage({ miniEngine: true, tipo: 'pausar' }, '*');
      mostrarCapa('pausado', texto);
    },
    continuar() {
      pausado = false;
      iframe?.contentWindow?.postMessage({ miniEngine: true, tipo: 'continuar' }, '*');
      mostrarCapa(null);
      iframe?.focus();
    },
    bloquear(texto) { this.parar(); mostrarCapa('bloqueado', texto); },
    focar() { iframe?.focus(); },
    get rodando() { return !!iframe; },
    get pausado() { return pausado; },
    destruir() { window.removeEventListener('message', ouvir); iframe?.remove(); },
  };
}
