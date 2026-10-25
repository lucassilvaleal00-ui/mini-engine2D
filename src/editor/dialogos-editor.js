/**
 * dialogos-editor.js — Janelas do editor: novo desenho, salvar e menu "Transformar".
 */

import { h, preencher } from '../ui/dom.js';
import { abrirDialogo, pedirTexto, menuAcoes } from '../ui/dialogos.js';
import { aviso, mensagemDeErro } from '../ui/toast.js';
import { RAIZ } from '../core/tipos.js';
import * as armazem from '../core/storage.js';
import { TAMANHO_MIN, TAMANHO_MAX } from './documento.js';
import { salvarDesenho, nomeDoQuadro, ultimaPasta } from './arquivo.js';
import { recortarRetangulo } from './algoritmos.js';

/* ------------------------------------------------------------------ */
/* Novo desenho: nome, largura, altura                                  */
/* ------------------------------------------------------------------ */

/** -> { nome, largura, altura } | null */
export function dialogoNovo() {
  return abrirDialogo(({ fechar }) => {
    const nome = h('input', {
      class: 'campo', id: 'novo-nome', type: 'text', maxLength: 56, autocomplete: 'off', spellcheck: false,
      placeholder: 'ex.: guerreiro_andar_baixo', 'data-foco': '',
    });
    const numero = (id, valor) => h('input', {
      class: 'campo', id, type: 'number', min: TAMANHO_MIN, max: TAMANHO_MAX, value: valor, inputMode: 'numeric',
    });
    const largura = numero('novo-largura', 32);
    const altura = numero('novo-altura', 32);
    const erro = h('p', { class: 'campo-erro', role: 'alert', hidden: true });

    const atalhos = [16, 32, 48, 64].map((n) => h('button', {
      class: 'segmento', type: 'button', onclick: () => { largura.value = n; altura.value = n; },
    }, `${n}×${n}`));

    const formulario = h('form', {
      class: 'dialogo-form',
      noValidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        const falha = (texto) => { erro.textContent = texto; erro.hidden = false; };
        let base;
        try {
          base = armazem.validarNome(nome.value);
        } catch (x) { falha(x.message); nome.focus(); return; }
        if (base.length > 56) { falha('Use até 56 letras: o app acrescenta _01, _02… no fim de cada frame.'); nome.focus(); return; }
        const w = Number(largura.value), a = Number(altura.value);
        const medida = (v) => Number.isInteger(v) && v >= TAMANHO_MIN && v <= TAMANHO_MAX;
        if (!medida(w)) { falha(`A largura deve ser um número inteiro de ${TAMANHO_MIN} a ${TAMANHO_MAX}.`); largura.focus(); return; }
        if (!medida(a)) { falha(`A altura deve ser um número inteiro de ${TAMANHO_MIN} a ${TAMANHO_MAX}.`); altura.focus(); return; }
        fechar({ nome: base, largura: w, altura: a });
      },
    },
    h('label', { class: 'campo-rotulo', htmlFor: 'novo-nome' }, 'Nome do desenho'),
    nome,
    h('div', { class: 'campo-rotulo' }, 'Tamanho (em pixels)'),
    h('div', { class: 'grupo-segmentos' }, atalhos),
    h('div', { class: 'duas-colunas' },
      h('div', {}, h('label', { class: 'campo-rotulo', htmlFor: 'novo-largura' }, 'Largura'), largura),
      h('div', {}, h('label', { class: 'campo-rotulo', htmlFor: 'novo-altura' }, 'Altura'), altura)),
    erro,
    h('div', { class: 'dialogo-botoes' },
      h('button', { class: 'botao', type: 'button', onclick: () => fechar(null) }, 'Cancelar'),
      h('button', { class: 'botao primario', type: 'submit' }, 'Criar')));

    return [h('h2', { class: 'dialogo-titulo' }, 'Novo desenho'), formulario];
  });
}

/* ------------------------------------------------------------------ */
/* Salvar: pasta + nome, com aviso de nome repetido                    */
/* ------------------------------------------------------------------ */

/**
 * Pede nome e pasta e grava (um arquivo por frame).
 * -> { itens, paraLixeira, origem, pastaTexto } quando salvou; null se cancelou.
 */
export async function dialogoSalvar(ctl) {
  let pastas = await armazem.listarPastas();
  let escolhida = ctl.origem?.pastaId ?? await ultimaPasta();
  if (escolhida !== RAIZ && !pastas.some((p) => p.id === escolhida)) escolhida = RAIZ;
  const total = ctl.e.quadros.length;

  return abrirDialogo(({ fechar }) => {
    let confirmando = false;

    const nome = h('input', {
      class: 'campo', id: 'salvar-nome', type: 'text', maxLength: 56, autocomplete: 'off', spellcheck: false,
      value: ctl.origem?.base ?? ctl.e.nome ?? '', 'data-foco': '',
    });
    const resumo = h('p', { class: 'dica pequena' });
    const aviso_ = h('div', { class: 'aviso-caixa atencao', role: 'alert', hidden: true });
    const erro = h('p', { class: 'campo-erro', role: 'alert', hidden: true });
    const arvore = h('div', { class: 'arvore', role: 'radiogroup', 'aria-label': 'Pasta de destino' });
    const botaoSalvar = h('button', { class: 'botao primario', type: 'submit' }, 'Salvar');

    const reiniciar = () => {
      confirmando = false;
      aviso_.hidden = true;
      erro.hidden = true;
      botaoSalvar.textContent = 'Salvar';
      atualizarResumo();
    };

    function atualizarResumo() {
      const base = nome.value.trim() || 'nome';
      const primeiro = nomeDoQuadro(base, 0, total);
      resumo.textContent = total === 1
        ? `Será salvo 1 arquivo: ${primeiro}`
        : `Serão salvos ${total} arquivos, um por frame: ${primeiro} … ${nomeDoQuadro(base, total - 1, total)}`;
    }

    function desenharArvore() {
      const opcoes = [{ id: RAIZ, nome: 'Raiz (início)', nivel: 0, icone: '🏠' },
        ...pastas.map((p) => ({ ...p, nivel: p.nivel + 1, icone: '📁' }))];
      preencher(arvore, opcoes.map((op) => h('button', {
        class: 'arvore-item', type: 'button', role: 'radio',
        'aria-checked': String(op.id === escolhida),
        style: { paddingLeft: `${10 + op.nivel * 18}px` },
        onclick: () => { escolhida = op.id; desenharArvore(); reiniciar(); },
      }, h('span', { 'aria-hidden': 'true' }, op.icone), h('span', { class: 'arvore-nome' }, op.nome))));
      arvore.querySelector('[aria-checked="true"]')?.scrollIntoView({ block: 'nearest' });
    }

    async function novaPasta() {
      const criada = await pedirTexto({
        titulo: 'Nova pasta', rotulo: 'Nome da pasta', rotuloConfirmar: 'Criar',
        processar: async (texto) => {
          try {
            const p = await armazem.criarPasta(texto, escolhida);
            escolhida = p.id;
            return null;
          } catch (x) { return mensagemDeErro(x); }
        },
      });
      if (criada !== null) { pastas = await armazem.listarPastas(); desenharArvore(); reiniciar(); }
    }

    const formulario = h('form', {
      class: 'dialogo-form',
      noValidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        botaoSalvar.disabled = true;
        try {
          const r = await salvarDesenho({
            estado: ctl.e, base: nome.value, pastaId: escolhida, origem: ctl.origem, confirmado: confirmando,
          });
          if (r.precisaConfirmar) {
            confirmando = true;
            const { conflitos, extras, proprios } = r.analise;
            const partes = [];
            if (conflitos.length) {
              partes.push(`Já existe${conflitos.length > 1 ? 'm' : ''} ${conflitos.length} arquivo${conflitos.length > 1 ? 's' : ''} com esse nome nesta pasta (${conflitos.map((i) => i.nome).join(', ')}). Salvar vai substituir ${conflitos.length > 1 ? 'esses arquivos' : 'esse arquivo'}.`);
            }
            const alheios = extras.filter((i) => !proprios.has(i.id));
            if (alheios.length) {
              partes.push(`Frames que sobrariam da cadeia antiga irão para a lixeira (${alheios.map((i) => i.nome).join(', ')}).`);
            }
            aviso_.textContent = partes.join(' ');
            aviso_.hidden = false;
            botaoSalvar.textContent = 'Substituir';
            return;
          }
          const trilha = escolhida === RAIZ ? [] : (await armazem.caminho(escolhida)).map((x) => x.nome);
          fechar({ ...r, pastaTexto: ['Raiz', ...trilha].join(' / '), pastaId: escolhida });
        } catch (x) {
          erro.textContent = mensagemDeErro(x);
          erro.hidden = false;
        } finally {
          botaoSalvar.disabled = false;
        }
      },
    },
    h('label', { class: 'campo-rotulo', htmlFor: 'salvar-nome' }, 'Nome'),
    nome,
    resumo,
    h('div', { class: 'campo-rotulo linha-flex' }, h('span', {}, 'Pasta'),
      h('button', { class: 'botao pequeno', type: 'button', onclick: novaPasta }, '＋ Nova pasta')),
    arvore,
    aviso_,
    erro,
    h('div', { class: 'dialogo-botoes' },
      h('button', { class: 'botao', type: 'button', onclick: () => fechar(null) }, 'Cancelar'),
      botaoSalvar));

    nome.addEventListener('input', reiniciar);
    desenharArvore();
    atualizarResumo();
    return [h('h2', { class: 'dialogo-titulo' }, 'Salvar desenho'), formulario];
  });
}

/* ------------------------------------------------------------------ */
/* Menu Transformar                                                    */
/* ------------------------------------------------------------------ */

export function menuTransformar(ctl, vista) {
  const sel = vista.selecao;
  const rodar = (fn) => () => {
    try { fn(); } catch (x) { aviso(x.message, { tipo: 'erro' }); }
  };
  const acoes = sel
    ? [
      { icone: '↔', rotulo: 'Espelhar seleção ↔', ao: rodar(() => ctl.espelhar('h', { regiao: sel })) },
      { icone: '↕', rotulo: 'Espelhar seleção ↕', ao: rodar(() => ctl.espelhar('v', { regiao: sel })) },
      {
        icone: '↻', rotulo: 'Girar seleção 90°',
        ao: rodar(() => {
          const nova = ctl.girar({ regiao: sel });
          if (nova && nova !== true) vista.selecao = recortarRetangulo(nova, ctl.largura, ctl.altura);
        }),
      },
      { icone: '⌫', rotulo: 'Apagar seleção', perigo: true, ao: rodar(() => ctl.limparRegiao(sel)) },
    ]
    : [
      { icone: '↔', rotulo: 'Espelhar este frame ↔', ao: rodar(() => ctl.espelhar('h')) },
      { icone: '↕', rotulo: 'Espelhar este frame ↕', ao: rodar(() => ctl.espelhar('v')) },
      { icone: '↔', rotulo: 'Espelhar todos os frames ↔', nota: 'ex.: andar esquerda → direita', ao: rodar(() => ctl.espelhar('h', { escopo: 'todos' })) },
      { icone: '↕', rotulo: 'Espelhar todos os frames ↕', ao: rodar(() => ctl.espelhar('v', { escopo: 'todos' })) },
      {
        icone: '↻', rotulo: 'Girar o desenho 90°',
        nota: ctl.largura === ctl.altura ? 'todos os frames' : 'troca largura e altura',
        ao: rodar(() => { ctl.girar(); }),
      },
      { icone: '⌫', rotulo: 'Limpar este frame', perigo: true, ao: rodar(() => ctl.limparQuadro()) },
    ];
  return menuAcoes({
    titulo: sel ? 'Transformar seleção' : 'Transformar',
    subtitulo: sel ? `Seleção de ${sel.w}×${sel.h} pixels` : 'Dá para desfazer logo depois',
    acoes,
  });
}
