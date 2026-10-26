/**
 * cenario.js (tela) — Construção de cenário.
 *
 * Rotas:
 *   #/cenario        lista de cenários + "＋ Novo cenário" (pergunta o nome primeiro)
 *   #/cenario/<id>   o construtor: arquivos à esquerda, a tela gigante no centro,
 *                    informações do objeto selecionado (nível 1, 2 ou 3) à direita
 *
 * O cenário guarda REFERÊNCIAS aos frames (não cópias). Salva sozinho a cada mudança.
 */

import { h, preencher } from '../ui/dom.js';
import { aviso, avisarErro } from '../ui/toast.js';
import { abrirDialogo } from '../ui/dialogos.js';
import { formatarDataHora, pluralizar } from '../ui/formato.js';
import * as armazem from '../core/storage.js';
import { RAIZ } from '../core/tipos.js';
import { agruparSprites } from '../editor/arquivo.js';
import {
  GRADES, NIVEIS, CELULAS_MIN, celulasMaximas, novoIdObjeto, listarCenarios, criarCenario,
  abrirCenario, salvarCenario, extremoDaOrdem, redimensionar, larguraPx, alturaPx, normalizar,
} from '../cenario/modelo.js';
import { estadoDoSprite, frameDoSprite, comporCenario } from '../cenario/render.js';
import { VistaCenario } from '../cenario/vista.js';
import { miniaturaDoItem, registrarMiniaturaDeCenario, rgbaParaCanvas } from '../ui/miniaturas.js';

const MAX_DESFAZER = 60;

// A miniatura de um cenário (Gerenciador e lista) é o cenário inteiro desenhado.
registrarMiniaturaDeCenario(async (dados) => {
  const c = normalizar(dados);
  return rgbaParaCanvas(await comporCenario(c));
});

export function montar(el, args) {
  return args.parametro ? montarConstrutor(el, args) : montarLista(el, args);
}

/* ================================================================== */
/* Lista                                                                */
/* ================================================================== */

async function montarLista(el, { navegar, voltar }) {
  document.title = 'Construção de cenário · Mini Engine';
  const grade = h('div', { class: 'projetos' });
  el.append(
    h('header', { class: 'topo' },
      h('button', { class: 'botao', type: 'button', 'aria-label': 'Voltar', onclick: () => voltar('/') }, '←'),
      h('h1', {}, 'Construção de cenário')),
    h('p', { class: 'dica' }, 'Monte cenários colocando os seus desenhos numa tela grande com grade. Cada objeto fica no nível 1 (fundo), 2 (meio) ou 3 (frente).'),
    grade);

  async function desenhar() {
    let lista = [];
    try { lista = await listarCenarios(); } catch (x) { avisarErro(x); }
    preencher(grade, [
      h('button', { class: 'projeto-cartao novo', type: 'button', onclick: () => novo() },
        h('span', { class: 'projeto-mais', 'aria-hidden': 'true' }, '＋'),
        h('span', { class: 'projeto-nome' }, 'Novo cenário')),
      ...lista.map((c) => {
        const capa = h('span', { class: 'projeto-capa vazia', 'aria-hidden': 'true' }, '🗺️');
        miniaturaDoItem(c).then((src) => { if (src) capa.replaceWith(h('img', { class: 'projeto-capa', src, alt: '' })); });
        return h('button', { class: 'projeto-cartao', type: 'button', onclick: () => navegar(`/cenario/${c.id}`) },
          capa,
          h('span', { class: 'projeto-nome' }, c.nome),
          h('small', { class: 'projeto-info' }, `${c.resumo?.descricao || ''} · ${formatarDataHora(c.atualizadoEm)}`));
      }),
    ]);
  }

  async function novo() {
    const r = await dialogoNovoCenario();
    if (!r) return;
    navegar(`/cenario/${r.id}`);
  }

  const aoSincronizar = (e) => { if (e.detail?.mudou) desenhar(); };
  globalThis.addEventListener('miniengine:nuvem', aoSincronizar);
  await desenhar();
  return () => globalThis.removeEventListener('miniengine:nuvem', aoSincronizar);
}

/** Pergunta nome, grade, tamanho e pasta; cria o item. -> item | null */
async function dialogoNovoCenario() {
  const pastas = await armazem.listarPastas().catch(() => []);
  const ui = { grade: 16 };
  return abrirDialogo(({ fechar }) => {
    const nome = h('input', { class: 'campo', id: 'cen-nome', type: 'text', maxLength: 60, autocomplete: 'off', placeholder: 'ex.: floresta', 'data-foco': '' });
    const colunas = h('input', { class: 'campo', id: 'cen-colunas', type: 'number', min: CELULAS_MIN, value: 64, inputMode: 'numeric' });
    const linhas = h('input', { class: 'campo', id: 'cen-linhas', type: 'number', min: CELULAS_MIN, value: 36, inputMode: 'numeric' });
    const pasta = h('select', { class: 'campo', id: 'cen-pasta' },
      h('option', { value: RAIZ }, 'Raiz (início)'),
      pastas.map((p) => h('option', { value: p.id }, `${'— '.repeat(p.nivel)}${p.nome}`)));
    const grades = h('div', { class: 'grupo-segmentos', role: 'group', 'aria-label': 'Tamanho da célula' });
    const medida = h('p', { class: 'dica pequena', 'aria-live': 'polite' });
    const erro = h('p', { class: 'campo-erro', role: 'alert', hidden: true });
    const atualizar = () => {
      preencher(grades, GRADES.map((g) => h('button', {
        class: 'segmento', type: 'button', 'aria-pressed': String(g === ui.grade), onclick: () => { ui.grade = g; atualizar(); },
      }, `${g}×${g}`)));
      const max = celulasMaximas(ui.grade);
      colunas.max = max; linhas.max = max;
      const c = Number(colunas.value) || 0, l = Number(linhas.value) || 0;
      medida.textContent = `Tela de ${c * ui.grade} × ${l * ui.grade} pixels (máximo ${max} células por lado nesta grade).`;
    };
    colunas.addEventListener('input', atualizar);
    linhas.addEventListener('input', atualizar);
    atualizar();
    return [
      h('h2', { class: 'dialogo-titulo' }, 'Novo cenário'),
      h('form', {
        class: 'dialogo-form',
        onsubmit: async (ev) => {
          ev.preventDefault();
          erro.hidden = true;
          const max = celulasMaximas(ui.grade);
          const c = Math.round(Number(colunas.value)), l = Math.round(Number(linhas.value));
          if (!(c >= CELULAS_MIN && c <= max && l >= CELULAS_MIN && l <= max)) {
            erro.textContent = `Use de ${CELULAS_MIN} a ${max} células de largura e de altura.`; erro.hidden = false; return;
          }
          try {
            const item = await criarCenario({ nome: nome.value, grade: ui.grade, colunas: c, linhas: l, pastaId: pasta.value });
            fechar(item);
          } catch (x) { erro.textContent = x.message; erro.hidden = false; nome.focus(); }
        },
      },
      h('label', { class: 'campo-rotulo', htmlFor: 'cen-nome' }, 'Nome do cenário'), nome,
      h('div', { class: 'campo-rotulo' }, 'Tamanho da célula da grade (use o mesmo dos seus sprites)'), grades,
      h('div', { class: 'duas-colunas' },
        h('label', { class: 'campo-rotulo', htmlFor: 'cen-colunas' }, 'Largura (células)'),
        h('label', { class: 'campo-rotulo', htmlFor: 'cen-linhas' }, 'Altura (células)'),
        colunas, linhas),
      medida,
      h('label', { class: 'campo-rotulo', htmlFor: 'cen-pasta' }, 'Guardar na pasta'), pasta,
      erro,
      h('div', { class: 'dialogo-botoes' },
        h('button', { class: 'botao', type: 'button', onclick: () => fechar(null) }, 'Cancelar'),
        h('button', { class: 'botao primario', type: 'submit' }, 'Criar'))),
    ];
  });
}

/* ================================================================== */
/* Construtor                                                           */
/* ================================================================== */

async function montarConstrutor(el, { parametro, navegar, voltar }) {
  const aberto = await abrirCenario(parametro).catch(() => null);
  if (!aberto) {
    aviso('Esse cenário não existe mais (ou está na lixeira).', { tipo: 'erro' });
    navegar('/cenario', { substituir: true });
    return undefined;
  }
  const id = parametro;
  const cen = aberto.cenario;
  document.title = `${cen.name} · Cenário`;
  el.classList.add('cenario-ativo');

  let selecionado = null;
  let pincel = null;          // { spriteId, quadro, nome }
  let encaixe = true;
  let mostrarSolidos = true;
  let modoMao = false;
  const niveisVisiveis = new Set([1, 2, 3]);
  const passado = [];
  const futuro = [];
  let pastaAtual = RAIZ;
  let relogioSalvar = 0;
  let salvando = false;
  let pendente = false;
  let antesDoArrasto = null;

  /* ---------- elementos ---------- */
  const status = h('span', { class: 'cen-status', 'aria-live': 'polite' }, 'Salvo');
  const bDesfazer = h('button', { class: 'botao icone', type: 'button', 'aria-label': 'Desfazer', title: 'Desfazer (Ctrl+Z)', onclick: () => desfazer() }, '↶');
  const bRefazer = h('button', { class: 'botao icone', type: 'button', 'aria-label': 'Refazer', title: 'Refazer (Ctrl+Y)', onclick: () => refazer() }, '↷');
  const bArquivos = h('button', { class: 'botao cen-alternar', type: 'button', 'aria-pressed': 'false', onclick: () => alternarPainel('arquivos') }, '📁 Arquivos');
  const bInfo = h('button', { class: 'botao cen-alternar', type: 'button', 'aria-pressed': 'false', onclick: () => alternarPainel('info') }, 'ℹ Info');

  const painelArquivos = h('aside', { class: 'cen-painel cen-arquivos', 'aria-label': 'Pastas e arquivos' });
  const painelInfo = h('aside', { class: 'cen-painel cen-info', 'aria-label': 'Informações' });
  const palco = h('div', { class: 'cen-palco' });
  const faixaPincel = h('div', { class: 'cen-faixa', hidden: true });
  const bMao = h('button', { class: 'botao pequeno icone', type: 'button', 'aria-pressed': 'false', title: 'Mão: arrastar move a vista', 'aria-label': 'Mão', onclick: () => { modoMao = !modoMao; bMao.setAttribute('aria-pressed', String(modoMao)); } }, '✋');
  const zoom = h('div', { class: 'cen-zoom' },
    bMao,
    h('button', { class: 'botao pequeno icone', type: 'button', 'aria-label': 'Aproximar', onclick: () => vista.zoomMais() }, '＋'),
    h('button', { class: 'botao pequeno icone', type: 'button', 'aria-label': 'Afastar', onclick: () => vista.zoomMenos() }, '－'),
    h('button', { class: 'botao pequeno icone', type: 'button', 'aria-label': 'Ver tudo', onclick: () => vista.ajustar() }, '⤢'));
  const centro = h('section', { class: 'cen-centro', 'aria-label': 'Tela do cenário' }, palco, faixaPincel, zoom);

  const raiz = h('div', { class: 'cen-tela' },
    h('header', { class: 'topo cen-topo' },
      h('button', { class: 'botao', type: 'button', 'aria-label': 'Voltar', onclick: () => sair() }, '←'),
      h('h1', { class: 'cen-titulo' }, cen.name),
      status,
      h('span', { class: 'espaco' }),
      bArquivos, bDesfazer, bRefazer, bInfo),
    h('div', { class: 'cen-corpo' }, painelArquivos, centro, painelInfo));
  el.append(raiz);

  function alternarPainel(qual) {
    const abrir = !raiz.classList.contains(`mostra-${qual}`);
    raiz.classList.remove('mostra-arquivos', 'mostra-info');
    if (abrir) raiz.classList.add(`mostra-${qual}`);
    bArquivos.setAttribute('aria-pressed', String(raiz.classList.contains('mostra-arquivos')));
    bInfo.setAttribute('aria-pressed', String(raiz.classList.contains('mostra-info')));
  }
  const fecharPaineisNoCelular = () => {
    if (matchMedia('(max-width: 899px)').matches) { raiz.classList.remove('mostra-arquivos', 'mostra-info'); bArquivos.setAttribute('aria-pressed', 'false'); bInfo.setAttribute('aria-pressed', 'false'); }
  };

  /* ---------- vista ---------- */
  const vista = new VistaCenario(palco, {
    cenario: () => cen,
    selecionado: () => selecionado,
    pincel: () => pincel,
    encaixe: () => encaixe,
    niveisVisiveis: () => niveisVisiveis,
    mostrarSolidos: () => mostrarSolidos,
    modoMao: () => modoMao,
    aoSelecionar: (oid) => { selecionado = oid; desenharInfo(); vista.desenhar(); },
    aoComecarArrasto: () => { antesDoArrasto = foto(); },
    aoArrastar: (oid, x, y) => {
      const o = cen.objetos.find((k) => k.id === oid);
      if (o) { o.x = x; o.y = y; }
    },
    aoSoltar: (oid, moveu) => {
      if (moveu && antesDoArrasto) { registrar(antesDoArrasto); antesDoArrasto = null; mudou(); }
    },
    aoColocar: (x, y) => {
      if (!pincel) return;
      if (cen.objetos.length >= 3000) { aviso('Limite de 3000 objetos por cenário.', { tipo: 'erro' }); return; }
      registrar(foto());
      const o = { id: novoIdObjeto(), spriteId: pincel.spriteId, quadro: pincel.quadro, x, y, nivel: pincel.nivel || 2, solido: false, espelhar: false };
      cen.objetos.push(o);
      selecionado = o.id;
      mudou();
    },
  });

  /* ---------- desfazer / salvar ---------- */
  const foto = () => JSON.stringify({ grade: cen.grade, colunas: cen.colunas, linhas: cen.linhas, fundo: cen.fundo, objetos: cen.objetos });
  const aplicarFoto = (t) => Object.assign(cen, JSON.parse(t));
  function registrar(f) { passado.push(f); if (passado.length > MAX_DESFAZER) passado.shift(); futuro.length = 0; }
  function desfazer() {
    if (!passado.length) return;
    futuro.push(foto()); aplicarFoto(passado.pop());
    if (!cen.objetos.some((o) => o.id === selecionado)) selecionado = null;
    mudou({ semHistorico: true });
  }
  function refazer() {
    if (!futuro.length) return;
    passado.push(foto()); aplicarFoto(futuro.pop());
    if (!cen.objetos.some((o) => o.id === selecionado)) selecionado = null;
    mudou({ semHistorico: true });
  }
  function mudou() {
    bDesfazer.disabled = !passado.length;
    bRefazer.disabled = !futuro.length;
    status.textContent = 'Alterado…';
    status.dataset.estado = 'sujo';
    clearTimeout(relogioSalvar);
    relogioSalvar = setTimeout(salvar, 900);
    desenharInfo();
    vista.desenhar();
  }
  async function salvar() {
    clearTimeout(relogioSalvar);
    if (salvando) { pendente = true; return; }
    salvando = true;
    status.textContent = 'Salvando…';
    try {
      await salvarCenario(id, cen);
      status.textContent = 'Salvo';
      status.dataset.estado = '';
    } catch (x) {
      status.textContent = 'Não salvou';
      status.dataset.estado = 'erro';
      avisarErro(x);
    } finally {
      salvando = false;
      if (pendente) { pendente = false; salvar(); }
    }
  }
  async function sair() {
    if (status.dataset.estado === 'sujo') await salvar();
    voltar('/cenario');
  }

  /* ---------- painel de arquivos (esquerda) ---------- */
  async function desenharArquivos() {
    let filhos = [];
    let trilha = [];
    try {
      filhos = await armazem.listarFilhos(pastaAtual);
      trilha = pastaAtual === RAIZ ? [] : (await armazem.caminho(pastaAtual)) || [];
    } catch (x) { avisarErro(x); }
    const pastas = filhos.filter((i) => i.tipo === 'pasta');
    const desenhos = agruparSprites(filhos);
    const migalhas = [h('button', { type: 'button', class: 'link', onclick: () => irPara(RAIZ) }, 'Raiz')];
    trilha.forEach((p) => migalhas.push(' › ', h('button', { type: 'button', class: 'link', onclick: () => irPara(p.id) }, p.nome)));

    preencher(painelArquivos,
      h('div', { class: 'cen-painel-titulo' }, 'Pastas e arquivos'),
      h('nav', { class: 'cen-migalhas', 'aria-label': 'Caminho' }, migalhas),
      h('ul', { class: 'cen-lista' },
        pastaAtual !== RAIZ && h('li', {}, h('button', {
          class: 'cen-item', type: 'button', onclick: () => irPara(trilha.length > 1 ? trilha[trilha.length - 2].id : RAIZ),
        }, h('span', { class: 'cen-icone' }, '↩'), h('span', {}, 'Voltar uma pasta'))),
        pastas.map((p) => h('li', {}, h('button', { class: 'cen-item', type: 'button', onclick: () => irPara(p.id) },
          h('span', { class: 'cen-icone' }, '📁'), h('span', { class: 'cen-item-nome' }, p.nome)))),
        desenhos.map((g) => {
          const icone = h('span', { class: 'cen-icone' }, '🎨');
          miniaturaDoItem(g.itens[0]).then((src) => { if (src) icone.replaceChildren(h('img', { src, alt: '' })); });
          const ativo = pincel && g.itens.some((i) => i.id === pincel.spriteId);
          return h('li', {}, h('button', {
            class: 'cen-item', type: 'button', 'aria-pressed': String(!!ativo), onclick: () => escolherDesenho(g),
          }, icone,
          h('span', { class: 'cen-item-nome' }, g.base),
          h('small', {}, `${g.quadros > 1 ? `${g.quadros} frames · ` : ''}${g.largura ?? '?'}×${g.altura ?? '?'}`)));
        })),
      !pastas.length && !desenhos.length && h('p', { class: 'dica pequena' }, 'Nada nesta pasta. Desenhe no Editor e salve aqui.'),
      h('p', { class: 'dica pequena' }, 'Toque num desenho e depois toque no cenário para colocá-lo.'));
  }
  async function irPara(pid) { pastaAtual = pid; await desenharArquivos(); }

  /** Desenho com vários frames: pergunta qual frame colocar. */
  async function escolherDesenho(grupo) {
    const frames = [];
    for (const item of grupo.itens) {
      const s = await estadoDoSprite(item.id);
      if (!s) continue;
      for (let q = 0; q < s.estado.quadros.length; q++) frames.push({ spriteId: item.id, quadro: q, nome: item.nome });
    }
    if (!frames.length) { aviso('Esse desenho está vazio ou foi apagado.', { tipo: 'erro' }); return; }
    const escolha = frames.length === 1 ? frames[0] : await dialogoFrame(grupo.base, frames);
    if (!escolha) return;
    armarPincel({ ...escolha, nome: frames.length > 1 ? `${grupo.base} (frame ${frames.indexOf(escolha) + 1})` : grupo.base });
  }

  function armarPincel(p) {
    pincel = p;
    selecionado = null;
    preencher(faixaPincel,
      h('span', {}, `Colocando: `, h('strong', {}, p.nome), ' — toque no cenário. Nível: '),
      ...NIVEIS.map((n) => h('button', {
        class: 'segmento pequeno', type: 'button', 'aria-pressed': String((p.nivel || 2) === n.nivel),
        onclick: () => { pincel.nivel = n.nivel; armarPincel(pincel); },
      }, `${n.nivel} ${n.nome}`)),
      h('button', { class: 'botao pequeno', type: 'button', onclick: () => desarmar() }, '✕ Parar'));
    faixaPincel.hidden = false;
    fecharPaineisNoCelular();
    desenharArquivos();
    desenharInfo();
    vista.desenhar();
  }
  function desarmar() {
    pincel = null;
    faixaPincel.hidden = true;
    vista.hover = null;
    desenharArquivos();
    vista.desenhar();
  }

  /* ---------- painel de informações (direita) ---------- */
  function seg(rotulo, opcoes, atual, ao) {
    return h('div', { class: 'cen-campo' },
      h('div', { class: 'campo-rotulo' }, rotulo),
      h('div', { class: 'grupo-segmentos', role: 'group', 'aria-label': rotulo }, opcoes.map(([v, txt]) => h('button', {
        class: 'segmento', type: 'button', 'aria-pressed': String(v === atual), onclick: () => ao(v),
      }, txt))));
  }

  async function desenharInfo() {
    const o = selecionado && cen.objetos.find((x) => x.id === selecionado);
    if (!o) { desenharInfoCenario(); return; }
    const s = await estadoDoSprite(o.spriteId);
    if (selecionado !== o.id) return; // mudou enquanto carregava
    const alterar = (fn) => { registrar(foto()); fn(); mudou(); };
    const total = s ? s.estado.quadros.length : 1;
    const caminho = s ? ((await armazem.caminho(s.paiId).catch(() => null)) || []).map((p) => p.nome).join(' / ') : '';
    const img = h('div', { class: 'cen-info-imagem' });
    frameDoSprite(o.spriteId, o.quadro).then((f) => { if (f) img.replaceChildren(rgbaParaCanvas(f)); });
    const mesmoNivel = cen.objetos.filter((x) => x.nivel === o.nivel);
    const posNoNivel = mesmoNivel.indexOf(o) + 1;

    preencher(painelInfo,
      h('div', { class: 'cen-painel-titulo' }, 'Arquivo selecionado'),
      img,
      h('p', { class: 'cen-info-nome' }, s ? s.nome : '⚠ sprite apagado'),
      h('p', { class: 'dica pequena' }, s ? `${caminho || 'Raiz'} · ${s.estado.largura}×${s.estado.altura} px` : 'O desenho deste objeto foi apagado. Remova-o ou desfaça.'),
      total > 1 && h('div', { class: 'cen-campo' },
        h('label', { class: 'campo-rotulo', htmlFor: 'cen-quadro' }, 'Frame'),
        h('select', { class: 'campo', id: 'cen-quadro', onchange: (e) => alterar(() => { o.quadro = Number(e.target.value); }) },
          Array.from({ length: total }, (_, q) => h('option', { value: q, selected: q === o.quadro }, `Frame ${q + 1} de ${total}`)))),
      seg('Nível (profundidade)', NIVEIS.map((n) => [n.nivel, `${n.nivel} · ${n.nome}`]), o.nivel, (v) => alterar(() => {
        // muda de nível indo para cima de todos os daquele nível
        const i = cen.objetos.indexOf(o);
        cen.objetos.splice(i, 1);
        o.nivel = v;
        cen.objetos.push(o);
      })),
      h('p', { class: 'dica pequena' }, `É o ${posNoNivel}º de ${mesmoNivel.length} no nível ${o.nivel}. Nível 3 fica na frente do 2, que fica na frente do 1.`),
      seg('Tipo', [[false, 'Decoração'], [true, 'Sólido (colide)']], o.solido, (v) => alterar(() => { o.solido = v; })),
      h('div', { class: 'cen-campo cen-posicao' },
        h('div', { class: 'campo-rotulo' }, `Posição (px) · célula ${Math.floor(o.x / cen.grade)}, ${Math.floor(o.y / cen.grade)}`),
        h('div', { class: 'duas-colunas' },
          h('input', { class: 'campo', type: 'number', 'aria-label': 'X', value: o.x, onchange: (e) => alterar(() => { o.x = Math.round(Number(e.target.value) || 0); }) }),
          h('input', { class: 'campo', type: 'number', 'aria-label': 'Y', value: o.y, onchange: (e) => alterar(() => { o.y = Math.round(Number(e.target.value) || 0); }) }))),
      h('div', { class: 'cen-botoes' },
        h('button', { class: 'botao pequeno', type: 'button', onclick: () => alterar(() => { o.espelhar = !o.espelhar; }) }, o.espelhar ? '↔ Desespelhar' : '↔ Espelhar'),
        h('button', { class: 'botao pequeno', type: 'button', onclick: () => alterar(() => extremoDaOrdem(cen, o.id, true)) }, '⤒ Para a frente'),
        h('button', { class: 'botao pequeno', type: 'button', onclick: () => alterar(() => extremoDaOrdem(cen, o.id, false)) }, '⤓ Para trás'),
        h('button', { class: 'botao pequeno', type: 'button', onclick: () => duplicar(o) }, '⧉ Duplicar'),
        h('button', { class: 'botao pequeno perigo', type: 'button', onclick: () => remover(o) }, '🗑 Remover')),
      h('button', { class: 'link', type: 'button', onclick: () => { selecionado = null; desenharInfo(); vista.desenhar(); } }, 'Ver informações do cenário'));
  }

  function duplicar(o) {
    registrar(foto());
    const c = { ...o, id: novoIdObjeto(), x: o.x + cen.grade, y: o.y };
    cen.objetos.splice(cen.objetos.indexOf(o) + 1, 0, c);
    selecionado = c.id;
    mudou();
  }
  function remover(o) {
    registrar(foto());
    cen.objetos.splice(cen.objetos.indexOf(o), 1);
    selecionado = null;
    mudou();
    aviso('Objeto removido.', { acao: { rotulo: 'Desfazer', ao: () => desfazer() } });
  }

  function desenharInfoCenario() {
    const contagem = NIVEIS.map((n) => cen.objetos.filter((o) => o.nivel === n.nivel).length);
    const max = celulasMaximas(cen.grade);
    const colunas = h('input', { class: 'campo', type: 'number', min: CELULAS_MIN, max, value: cen.colunas, 'aria-label': 'Largura em células' });
    const linhas = h('input', { class: 'campo', type: 'number', min: CELULAS_MIN, max, value: cen.linhas, 'aria-label': 'Altura em células' });
    const cor = h('input', { type: 'color', class: 'cen-cor', value: cen.fundo || '#1e2233', 'aria-label': 'Cor de fundo', onchange: (e) => { registrar(foto()); cen.fundo = e.target.value; mudou(); } });
    preencher(painelInfo,
      h('div', { class: 'cen-painel-titulo' }, 'Cenário'),
      h('p', { class: 'cen-info-nome' }, cen.name),
      h('p', { class: 'dica pequena' }, `${larguraPx(cen)} × ${alturaPx(cen)} px · grade de ${cen.grade}px · ${pluralizar(cen.objetos.length, 'objeto', 'objetos')}`),
      h('div', { class: 'cen-campo' },
        h('div', { class: 'campo-rotulo' }, 'Ver os níveis'),
        h('div', { class: 'cen-niveis' }, NIVEIS.map((n, i) => h('label', { class: 'exp-marca' },
          h('input', { type: 'checkbox', checked: niveisVisiveis.has(n.nivel), onchange: (e) => { if (e.target.checked) niveisVisiveis.add(n.nivel); else niveisVisiveis.delete(n.nivel); vista.desenhar(); } }),
          h('span', {}, `${n.nivel} · ${n.nome}`), h('small', {}, pluralizar(contagem[i], 'objeto', 'objetos')))))),
      h('label', { class: 'exp-marca' },
        h('input', { type: 'checkbox', checked: encaixe, onchange: (e) => { encaixe = e.target.checked; } }),
        h('span', {}, 'Encaixar na grade'), h('small', {}, 'ao colocar e ao arrastar')),
      h('label', { class: 'exp-marca' },
        h('input', { type: 'checkbox', checked: mostrarSolidos, onchange: (e) => { mostrarSolidos = e.target.checked; vista.desenhar(); } }),
        h('span', {}, 'Marcar os sólidos de vermelho'), h('small', {}, 'só aqui no construtor')),
      h('div', { class: 'cen-campo' },
        h('div', { class: 'campo-rotulo' }, 'Fundo'),
        h('div', { class: 'cen-linha' }, cor,
          h('label', { class: 'exp-marca' }, h('input', {
            type: 'checkbox', checked: !cen.fundo, onchange: (e) => { registrar(foto()); cen.fundo = e.target.checked ? null : cor.value; mudou(); },
          }), h('span', {}, 'Transparente')))),
      h('div', { class: 'cen-campo' },
        h('div', { class: 'campo-rotulo' }, `Tamanho em células (máx. ${max})`),
        h('div', { class: 'duas-colunas' }, colunas, linhas),
        h('button', {
          class: 'botao pequeno', type: 'button',
          onclick: () => { registrar(foto()); redimensionar(cen, { colunas: Number(colunas.value), linhas: Number(linhas.value) }); mudou(); vista.ajustar(); },
        }, 'Aplicar tamanho')),
      h('p', { class: 'dica pequena' }, 'Atalhos: Delete remove · setas movem (Shift = 1 pixel) · 1, 2, 3 mudam o nível · Ctrl+D duplica · Esc para de colocar.'),
      h('p', { class: 'dica pequena' }, `No Criar jogo, chame este cenário com ${/^[\p{L}\p{N}_-]+$/u.test(cen.name) ? `@${cen.name}` : `@[${cen.name}]`}.`));
  }

  /* ---------- teclado ---------- */
  function aoTecla(ev) {
    if (document.querySelector('dialog[open]')) return;
    if (ev.target.closest?.('input, textarea, select')) return;
    const k = ev.key;
    if ((ev.ctrlKey || ev.metaKey) && k.toLowerCase() === 'z') { ev.preventDefault(); if (ev.shiftKey) refazer(); else desfazer(); return; }
    if ((ev.ctrlKey || ev.metaKey) && k.toLowerCase() === 'y') { ev.preventDefault(); refazer(); return; }
    if (k === ' ') { vista.espaco = true; ev.preventDefault(); return; }
    if (k === 'Escape') { if (pincel) desarmar(); else if (selecionado) { selecionado = null; desenharInfo(); vista.desenhar(); } return; }
    const o = selecionado && cen.objetos.find((x) => x.id === selecionado);
    if (!o) return;
    if ((ev.ctrlKey || ev.metaKey) && k.toLowerCase() === 'd') { ev.preventDefault(); duplicar(o); return; }
    if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); remover(o); return; }
    if (['1', '2', '3'].includes(k)) {
      registrar(foto());
      const i = cen.objetos.indexOf(o); cen.objetos.splice(i, 1); o.nivel = Number(k); cen.objetos.push(o);
      mudou(); return;
    }
    const passo = ev.shiftKey ? 1 : cen.grade;
    const d = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[k];
    if (d) { ev.preventDefault(); registrar(foto()); o.x += d[0]; o.y += d[1]; mudou(); }
  }
  const aoSoltarTecla = (ev) => { if (ev.key === ' ') vista.espaco = false; };
  const aoFechar = () => { if (status.dataset.estado === 'sujo') salvar(); };
  document.addEventListener('keydown', aoTecla);
  document.addEventListener('keyup', aoSoltarTecla);
  window.addEventListener('pagehide', aoFechar);
  const aoSincronizar = (e) => { if (e.detail?.mudou) { vista.esquecerImagens(); desenharArquivos(); } };
  globalThis.addEventListener('miniengine:nuvem', aoSincronizar);

  bDesfazer.disabled = true;
  bRefazer.disabled = true;
  await desenharArquivos();
  desenharInfo();

  return () => {
    if (status.dataset.estado === 'sujo') salvar();
    document.removeEventListener('keydown', aoTecla);
    document.removeEventListener('keyup', aoSoltarTecla);
    window.removeEventListener('pagehide', aoFechar);
    globalThis.removeEventListener('miniengine:nuvem', aoSincronizar);
    vista.destruir();
    el.classList.remove('cenario-ativo');
  };
}

/** Escolher o frame de um desenho com vários frames. -> frame | null */
function dialogoFrame(nome, frames) {
  return abrirDialogo(({ fechar }) => {
    const grade = h('div', { class: 'cen-frames' });
    frames.forEach((f, i) => {
      const botao = h('button', { class: 'cen-frame', type: 'button', onclick: () => fechar(f) },
        h('span', { class: 'cen-frame-img' }), h('small', {}, `Frame ${i + 1}`));
      frameDoSprite(f.spriteId, f.quadro).then((r) => { if (r) botao.firstChild.replaceChildren(rgbaParaCanvas(r)); });
      grade.append(botao);
    });
    return [
      h('h2', { class: 'dialogo-titulo' }, 'Qual frame colocar?'),
      h('p', { class: 'dialogo-sub' }, `“${nome}” tem ${frames.length} frames.`),
      grade,
      h('div', { class: 'dialogo-botoes' }, h('button', { class: 'botao', type: 'button', onclick: () => fechar(null) }, 'Cancelar')),
    ];
  });
}

