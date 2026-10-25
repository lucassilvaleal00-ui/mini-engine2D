/**
 * dialogos-arquivo.js — Janelas de Exportar e Importar do editor.
 *
 *   dialogoExportar(ctl)           escolhe formato/escala e baixa o arquivo
 *   importarArquivo({ ctl })       escolhe um arquivo (imagem ou JSON) e devolve o que fazer com ele:
 *                                    { tipo: 'desenho', estado, referencia, ... }  -> abrir como desenho novo
 *                                    { tipo: 'paleta', cores }                     -> acrescentar à paleta
 *                                    null                                          -> cancelado ou deu erro (já avisado)
 */

import { h, preencher } from '../ui/dom.js';
import { abrirDialogo } from '../ui/dialogos.js';
import { aviso, mensagemDeErro } from '../ui/toast.js';
import { baixar, tamanhoLegivel } from '../ui/baixar.js';
import { pluralizar } from '../ui/formato.js';
import { MAX_CORES, ErroDoEditor } from './documento.js';
import {
  ESCALAS, formatosDisponiveis, gerarSaida, escalaPadrao, escalaPermitida, medidasDaSaida, colunasPadrao,
} from './exportar.js';
import {
  quadroParaRgba, montarSpriteSheet, cortarEmQuadros, imagensParaEstado, coresParaPaleta, contarCores,
} from './imagem.js';
import {
  jsonParaEstado, imagemDeArquivo, sugerirQuadro, LADO_MAX_DESENHO, MAX_QUADROS, LIMITE_IMAGEM_BYTES,
} from './importar.js';

const esperarPintar = () => new Promise((r) => setTimeout(r, 30));

/** Desenha `rgba` num <canvas> pequeno, ampliado com pixels nítidos, dentro de uma caixa de até `maxL`×`maxA`. */
export function pintarPrevia(canvas, { rgba, largura, altura }, maxL = 300, maxA = 150) {
  canvas.width = largura;
  canvas.height = altura;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), largura, altura), 0, 0);
  const fator = Math.min(maxL / largura, maxA / altura);
  const s = fator >= 1 ? Math.floor(fator) : fator;
  canvas.style.width = `${Math.max(1, Math.round(largura * s))}px`;
  canvas.style.height = `${Math.max(1, Math.round(altura * s))}px`;
  return s;
}

/* ================================================================== */
/* Exportar                                                            */
/* ================================================================== */

export function dialogoExportar(ctl) {
  const e = ctl.e;
  const total = e.quadros.length;
  const formatos = formatosDisponiveis(e);
  const ui = {
    formato: 'png',
    escala: escalaPadrao(e),
    colunas: colunasPadrao(total),
    jsonDaSheet: false,
    comReferencia: !!ctl.referencia,
  };
  const camadaEscondida = e.camadas.some((c) => !c.visivel);

  return abrirDialogo(({ fechar }) => {
    const previa = h('canvas', { class: 'exp-previa-canvas', 'aria-label': 'Prévia do que será exportado', role: 'img' });
    const resumo = h('p', { class: 'dica pequena exp-resumo', 'aria-live': 'polite' });
    const lista = h('div', { class: 'exp-lista', role: 'radiogroup', 'aria-label': 'Formato' });
    const opcoes = h('div', { class: 'exp-opcoes' });
    const aviso_ = h('div', { class: 'aviso-caixa atencao', role: 'note', hidden: true });
    const erro = h('p', { class: 'campo-erro', role: 'alert', hidden: true });
    const botao = h('button', { class: 'botao primario', type: 'submit' }, 'Exportar');

    const pedido = () => ({ formato: ui.formato, escala: ui.escala, colunas: ui.colunas, jsonDaSheet: ui.jsonDaSheet, comReferencia: ui.comReferencia });
    const usaEscala = () => ui.formato !== 'json';

    function corrigirEscala() {
      if (!usaEscala()) return;
      if (escalaPermitida(e, pedido())) return;
      const cabe = [...ESCALAS].reverse().find((s) => escalaPermitida(e, { ...pedido(), escala: s }));
      ui.escala = cabe ?? 1;
    }

    function atualizarPrevia() {
      try {
        if (ui.formato === 'sheet') pintarPrevia(previa, montarSpriteSheet(e, { colunas: ui.colunas, escala: 1 }));
        else pintarPrevia(previa, quadroParaRgba(e, e.quadros[e.atual], 1));
      } catch { /* sem prévia */ }
    }

    function atualizar() {
      erro.hidden = true;
      corrigirEscala();
      // formato
      preencher(lista, formatos.map((f) => h('button', {
        class: 'exp-opcao', type: 'button', role: 'radio', 'aria-checked': String(f.id === ui.formato),
        onclick: () => { ui.formato = f.id; atualizar(); },
      }, h('span', { class: 'exp-opcao-titulo' }, f.rotulo), h('small', {}, f.nota))));

      // opções do formato
      const partes = [];
      if (usaEscala()) {
        partes.push(h('div', { class: 'campo-rotulo' }, 'Tamanho dos pixels (ampliação)'));
        partes.push(h('div', { class: 'grupo-segmentos', role: 'group', 'aria-label': 'Ampliação' }, ESCALAS.map((s) => h('button', {
          class: 'segmento', type: 'button', 'aria-pressed': String(s === ui.escala),
          disabled: !escalaPermitida(e, { ...pedido(), escala: s }),
          onclick: () => { ui.escala = s; atualizar(); },
        }, `${s}×`))));
      }
      if (ui.formato === 'sheet') {
        const colunas = h('input', {
          class: 'campo', id: 'exp-colunas', type: 'number', min: 1, max: total, value: ui.colunas, inputMode: 'numeric',
          oninput: (ev) => {
            const v = Math.round(Number(ev.target.value));
            if (Number.isFinite(v) && v >= 1) { ui.colunas = Math.min(total, v); corrigirEscala(); atualizarResumo(); atualizarPrevia(); }
          },
          onchange: () => atualizar(),
        });
        partes.push(h('label', { class: 'campo-rotulo', htmlFor: 'exp-colunas' }, `Frames por linha (de ${total})`), colunas);
        partes.push(h('label', { class: 'exp-marca' },
          h('input', { type: 'checkbox', checked: ui.jsonDaSheet, onchange: (ev) => { ui.jsonDaSheet = ev.target.checked; atualizarResumo(); } }),
          h('span', {}, 'Incluir um arquivo com a posição de cada frame (JSON)'),
          h('small', {}, 'vira um ZIP com a imagem e o JSON, útil para carregar a sprite sheet num jogo')));
      }
      if (ui.formato === 'json' && ctl.referencia) {
        partes.push(h('label', { class: 'exp-marca' },
          h('input', { type: 'checkbox', checked: ui.comReferencia, onchange: (ev) => { ui.comReferencia = ev.target.checked; atualizarResumo(); } }),
          h('span', {}, 'Incluir a imagem de inspiração'),
          h('small', {}, 'deixa o arquivo maior, mas ela volta junto quando você importar')));
      }
      if (ui.formato !== 'json' && ctl.referencia) {
        partes.push(h('p', { class: 'dica pequena' }, 'A imagem de inspiração nunca vai nas imagens exportadas.'));
      }
      preencher(opcoes, partes);

      aviso_.hidden = !(camadaEscondida && ['png', 'frames', 'sheet', 'gif'].includes(ui.formato));
      aviso_.textContent = 'Há camadas escondidas: elas não aparecem na imagem exportada. Mostre-as antes, se quiser incluí-las.';
      atualizarResumo();
      atualizarPrevia();
    }

    function atualizarResumo() {
      const m = medidasDaSaida(e, pedido());
      const nome = formatos.find((f) => f.id === ui.formato)?.rotulo ?? '';
      let t;
      if (ui.formato === 'json') t = `${e.largura}×${e.altura} pixels · ${pluralizar(total, 'frame', 'frames')} · ${pluralizar(e.camadas.length, 'camada', 'camadas')}`;
      else if (ui.formato === 'sheet') t = `${nome}: imagem de ${m.largura}×${m.altura} px (cada frame com ${m.quadroLargura}×${m.quadroAltura}).`;
      else if (ui.formato === 'frames' || ui.formato === 'camadas') t = `${nome}: imagens de ${m.largura}×${m.altura} px.`;
      else t = `${nome}: ${m.largura}×${m.altura} px.`;
      resumo.textContent = t;
    }

    const formulario = h('form', {
      class: 'dialogo-form', noValidate: true,
      onsubmit: async (ev) => {
        ev.preventDefault();
        botao.disabled = true;
        botao.textContent = 'Gerando…';
        erro.hidden = true;
        await esperarPintar();
        try {
          const saida = await gerarSaida({ e, referencia: ctl.referencia }, pedido());
          baixar(saida.bytes, saida.nome, saida.tipo);
          aviso(`Exportado: ${saida.nome} (${tamanhoLegivel(saida.bytes.length)}). Veja a pasta de downloads.`, { tipo: 'ok', duracao: 6000 });
          fechar(saida);
        } catch (x) {
          erro.textContent = mensagemDeErro(x);
          erro.hidden = false;
          botao.disabled = false;
          botao.textContent = 'Exportar';
        }
      },
    },
    h('div', { class: 'exp-previa' }, previa),
    resumo,
    h('div', { class: 'campo-rotulo' }, 'O que exportar'),
    lista,
    opcoes,
    aviso_,
    erro,
    h('div', { class: 'dialogo-botoes fixo' },
      h('button', { class: 'botao', type: 'button', onclick: () => fechar(null) }, 'Cancelar'),
      botao));

    atualizar();
    return [
      h('h2', { class: 'dialogo-titulo' }, 'Exportar'),
      h('p', { class: 'dialogo-sub' }, `${e.nome || 'Sem nome'} · ${e.largura}×${e.altura} · ${pluralizar(total, 'frame', 'frames')}`),
      formulario,
    ];
  });
}

/* ================================================================== */
/* Importar                                                            */
/* ================================================================== */

/** Abre o seletor de arquivos do aparelho. Devolve o arquivo ou null. */
function escolherArquivo() {
  return new Promise((resolve) => {
    const campo = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif,.json,application/json', hidden: true });
    let resolvido = false;
    const fim = (arq) => { if (resolvido) return; resolvido = true; campo.remove(); resolve(arq); };
    campo.addEventListener('change', () => fim(campo.files?.[0] ?? null));
    campo.addEventListener('cancel', () => fim(null));
    document.body.append(campo);
    campo.click();
  });
}

/** Janela simples de informação, com um botão. */
function dialogoInformacao({ titulo, mensagem, itens = [], rotulo = 'Entendi' }) {
  return abrirDialogo(({ fechar }) => [
    h('h2', { class: 'dialogo-titulo' }, titulo),
    mensagem && h('p', { class: 'dialogo-texto' }, mensagem),
    itens.length > 0 && h('ul', { class: 'imp-lista' }, itens.map((t) => h('li', {}, t))),
    h('div', { class: 'dialogo-botoes' }, h('button', { class: 'botao primario', type: 'button', 'data-foco': '', onclick: () => fechar(true) }, rotulo)),
  ]);
}

async function importarJson(arquivo) {
  const texto = await arquivo.text();
  const { estado, referencia, correcoes } = jsonParaEstado(texto, arquivo.name);
  if (correcoes.length) {
    const mostrar = correcoes.slice(0, 10);
    const restantes = correcoes.length - mostrar.length;
    const ok = await abrirDialogo(({ fechar }) => [
      h('h2', { class: 'dialogo-titulo' }, 'Arquivo corrigido automaticamente'),
      h('p', { class: 'dialogo-texto' }, `“${arquivo.name}” tinha ${pluralizar(correcoes.length, 'ponto', 'pontos')} a corrigir. Arrumei assim para poder abrir:`),
      h('ul', { class: 'imp-lista' }, mostrar.map((t) => h('li', {}, t)), restantes > 0 && h('li', {}, `…e mais ${pluralizar(restantes, 'ajuste', 'ajustes')}.`)),
      h('p', { class: 'dica pequena' }, 'O arquivo original não foi alterado. Confira o desenho antes de salvar.'),
      h('div', { class: 'dialogo-botoes' },
        h('button', { class: 'botao', type: 'button', onclick: () => fechar(false) }, 'Cancelar'),
        h('button', { class: 'botao primario', type: 'button', 'data-foco': '', onclick: () => fechar(true) }, 'Abrir mesmo assim')),
    ]);
    if (ok !== true) return null;
  }
  return { tipo: 'desenho', estado, referencia, correcoes };
}

function dialogoImagem(img, arquivo, ctl) {
  const { rgba, largura, altura } = img;
  const cores = contarCores(rgba);
  let semitransparentes = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 0 && rgba[i] < 255) semitransparentes++;
  const [qw0, qh0] = sugerirQuadro(largura, altura);
  const cabeNoEditor = largura <= LADO_MAX_DESENHO && altura <= LADO_MAX_DESENHO;
  const ui = { modo: cabeNoEditor ? 'novo' : 'sheet', qw: qw0, qh: qh0 };
  const maisDeUm = qw0 !== largura || qh0 !== altura;
  if (cabeNoEditor && maisDeUm) ui.modo = 'sheet'; // fila de quadrados: provavelmente é uma sprite sheet

  return abrirDialogo(({ fechar }) => {
    const previa = h('canvas', { class: 'exp-previa-canvas', role: 'img', 'aria-label': 'Prévia da imagem' });
    const grade = h('div', { class: 'imp-grade', hidden: true });
    const info = h('p', { class: 'dica pequena', 'aria-live': 'polite' });
    const opcoes = h('div', { class: 'exp-opcoes' });
    const modos = h('div', { class: 'exp-lista', role: 'radiogroup', 'aria-label': 'O que fazer com a imagem' });
    const avisos = h('div', { class: 'imp-avisos' });
    const erro = h('p', { class: 'campo-erro', role: 'alert', hidden: true });
    const botao = h('button', { class: 'botao primario', type: 'submit' }, 'Importar');
    let escalaPrevia = 1;

    const lista = [
      { id: 'novo', rotulo: 'Desenho novo', nota: 'a imagem inteira vira um frame' },
      { id: 'sheet', rotulo: 'Sprite sheet', nota: 'cortar em vários frames do mesmo tamanho' },
      ctl && { id: 'paleta', rotulo: 'Só as cores', nota: 'acrescentar as cores da imagem à paleta atual' },
    ].filter(Boolean);

    const medidaOk = (v) => Number.isInteger(v) && v >= 1 && v <= LADO_MAX_DESENHO;

    function verificar() {
      if (ui.modo === 'novo' && !cabeNoEditor) {
        return `Essa imagem tem ${largura}×${altura} pixels; o editor trabalha com até ${LADO_MAX_DESENHO}×${LADO_MAX_DESENHO}. Se for uma folha de frames menores, use “Sprite sheet”.`;
      }
      if (ui.modo === 'sheet') {
        if (!medidaOk(ui.qw) || !medidaOk(ui.qh)) return `O tamanho do frame precisa ser um número inteiro de 1 a ${LADO_MAX_DESENHO}.`;
        if (ui.qw > largura || ui.qh > altura) return `O frame (${ui.qw}×${ui.qh}) é maior que a imagem (${largura}×${altura}).`;
        const n = Math.floor(largura / ui.qw) * Math.floor(altura / ui.qh);
        if (n > MAX_QUADROS) return `Isso daria ${n} frames; o limite é ${MAX_QUADROS}. Use frames maiores.`;
      }
      if (ui.modo === 'paleta' && ctl) {
        const r = coresParaPaleta(rgba, ctl.e.paleta);
        if (r.total === 0) return 'Essa imagem não tem nenhum pixel opaco para pegar cores.';
        if (!r.novas.length && r.cortadas === 0) return 'Todas as cores dessa imagem já estão na paleta.';
        if (!r.novas.length) return `A paleta está cheia (máximo ${MAX_CORES - 1} cores, além da transparente). Apague cores que não usa e tente de novo.`;
      }
      return null;
    }

    function atualizarGrade() {
      const mostrar = ui.modo === 'sheet' && medidaOk(ui.qw) && medidaOk(ui.qh) && ui.qw <= largura && ui.qh <= altura;
      grade.hidden = !mostrar;
      if (!mostrar) return;
      grade.style.backgroundSize = `${ui.qw * escalaPrevia}px ${ui.qh * escalaPrevia}px`;
    }

    function atualizar() {
      erro.hidden = true;
      preencher(modos, lista.map((m) => h('button', {
        class: 'exp-opcao', type: 'button', role: 'radio', 'aria-checked': String(m.id === ui.modo),
        onclick: () => { ui.modo = m.id; atualizar(); },
      }, h('span', { class: 'exp-opcao-titulo' }, m.rotulo), h('small', {}, m.nota))));

      const partes = [];
      if (ui.modo === 'sheet') {
        const campo = (id, rotulo, chave) => h('div', {}, h('label', { class: 'campo-rotulo', htmlFor: id }, rotulo), h('input', {
          class: 'campo', id, type: 'number', min: 1, max: LADO_MAX_DESENHO, value: ui[chave], inputMode: 'numeric',
          oninput: (ev) => { ui[chave] = Number(ev.target.value); atualizarInfo(); },
        }));
        partes.push(h('div', { class: 'duas-colunas' }, campo('imp-qw', 'Largura do frame', 'qw'), campo('imp-qh', 'Altura do frame', 'qh')));
      }
      preencher(opcoes, partes);
      atualizarInfo();
    }

    function atualizarInfo() {
      atualizarGrade();
      const problema = verificar();
      botao.disabled = !!problema && ui.modo !== 'paleta';
      botao.textContent = ui.modo === 'paleta' ? 'Adicionar à paleta' : 'Importar';
      if (ui.modo === 'paleta' && problema) botao.disabled = true;

      const linhas = [];
      if (ui.modo === 'novo') linhas.push(`Imagem de ${largura}×${altura} pixels vira um desenho com 1 frame.`);
      if (ui.modo === 'sheet' && !problema) {
        const col = Math.floor(largura / ui.qw);
        const lin = Math.floor(altura / ui.qh);
        linhas.push(`${col} × ${lin} frames de ${ui.qw}×${ui.qh} (até ${pluralizar(col * lin, 'frame', 'frames')}; frames vazios no fim são descartados).`);
        const sobraX = largura - col * ui.qw;
        const sobraY = altura - lin * ui.qh;
        if (sobraX || sobraY) linhas.push(`Sobram ${sobraX ? `${sobraX} px à direita` : ''}${sobraX && sobraY ? ' e ' : ''}${sobraY ? `${sobraY} px embaixo` : ''}, que ficam de fora.`);
      }
      if (ui.modo === 'paleta' && ctl) {
        const r = coresParaPaleta(rgba, ctl.e.paleta);
        linhas.push(`${pluralizar(r.total, 'cor opaca', 'cores opacas')} na imagem · ${r.jaExistiam} já ${r.jaExistiam === 1 ? 'existe' : 'existem'} na paleta · ${r.novas.length} ${r.novas.length === 1 ? 'entra' : 'entram'}.`);
        if (r.cortadas) linhas.push(`${pluralizar(r.cortadas, 'cor fica', 'cores ficam')} de fora porque a paleta só aceita ${MAX_CORES - 1} cores (além da transparente). Entram as mais usadas.`);
      }
      info.textContent = linhas.join(' ');

      const caixas = [];
      if (problema) caixas.push(h('div', { class: 'aviso-caixa erro', role: 'alert' }, problema));
      if (ui.modo !== 'paleta') {
        if (cores.size > MAX_CORES - 1) {
          caixas.push(h('div', { class: 'aviso-caixa atencao', role: 'note' },
            `Essa imagem tem ${cores.size} cores, mas o editor aceita até ${MAX_CORES - 1} (além da transparente). Vou reduzir as cores automaticamente; algumas podem mudar um pouco.`));
        }
        if (semitransparentes) {
          caixas.push(h('div', { class: 'aviso-caixa atencao', role: 'note' },
            `${pluralizar(semitransparentes, 'pixel é semitransparente', 'pixels são semitransparentes')}. No editor cada pixel é opaco ou vazio: de 50% para cima fica opaco, abaixo disso fica transparente.`));
        }
      }
      if (arquivo.type === 'image/gif') {
        caixas.push(h('p', { class: 'dica pequena' }, 'GIF animado: só o primeiro quadro é lido. Para trazer a animação, use uma sprite sheet em PNG.'));
      }
      preencher(avisos, caixas);
    }

    const formulario = h('form', {
      class: 'dialogo-form', noValidate: true,
      onsubmit: async (ev) => {
        ev.preventDefault();
        if (verificar()) return;
        botao.disabled = true;
        await esperarPintar();
        try {
          if (ui.modo === 'paleta') {
            const r = coresParaPaleta(rgba, ctl.e.paleta);
            fechar({ tipo: 'paleta', cores: r.novas, info: r });
            return;
          }
          let resultado;
          if (ui.modo === 'novo') {
            resultado = imagensParaEstado({ quadros: [rgba], largura, altura, nome: img.nome });
          } else {
            const corte = cortarEmQuadros({ rgba, largura, altura, quadroLargura: ui.qw, quadroAltura: ui.qh });
            resultado = imagensParaEstado({ quadros: corte.quadros, largura: ui.qw, altura: ui.qh, nome: img.nome });
          }
          fechar({ tipo: 'desenho', estado: resultado.estado, referencia: null, info: resultado.info, correcoes: [] });
        } catch (x) {
          erro.textContent = mensagemDeErro(x);
          erro.hidden = false;
          botao.disabled = false;
        }
      },
    },
    h('div', { class: 'exp-previa' }, h('div', { class: 'imp-previa-caixa' }, previa, grade)),
    h('div', { class: 'campo-rotulo' }, 'O que fazer com a imagem'),
    modos,
    opcoes,
    info,
    avisos,
    erro,
    h('div', { class: 'dialogo-botoes fixo' },
      h('button', { class: 'botao', type: 'button', onclick: () => fechar(null) }, 'Cancelar'),
      botao));

    escalaPrevia = pintarPrevia(previa, img, 300, 160);
    grade.style.width = previa.style.width;
    grade.style.height = previa.style.height;
    atualizar();
    return [
      h('h2', { class: 'dialogo-titulo' }, 'Importar imagem'),
      h('p', { class: 'dialogo-sub' }, `${arquivo.name} · ${largura}×${altura} px · ${pluralizar(cores.size, 'cor', 'cores')}`),
      formulario,
    ];
  });
}

/**
 * Escolhe um arquivo e conduz a importação.
 * @param ctl  controlador do editor aberto (habilita "Só as cores → paleta"); null na tela de escolha
 */
export async function importarArquivo({ ctl = null } = {}) {
  const arquivo = await escolherArquivo();
  if (!arquivo) return null;
  try {
    if (/\.zip$/i.test(arquivo.name) || arquivo.type === 'application/zip') {
      throw new ErroDoEditor('Esse é um arquivo ZIP. Para restaurar um backup, use a tela “Backup” do app.');
    }
    if (arquivo.size > LIMITE_IMAGEM_BYTES) throw new ErroDoEditor('Esse arquivo é grande demais (mais de 30 MB).');
    if (/\.json$/i.test(arquivo.name) || arquivo.type === 'application/json') return await importarJson(arquivo);
    const img = await imagemDeArquivo(arquivo);
    return await dialogoImagem(img, arquivo, ctl);
  } catch (x) {
    await dialogoInformacao({ titulo: 'Não consegui importar', mensagem: mensagemDeErro(x) });
    return null;
  }
}
