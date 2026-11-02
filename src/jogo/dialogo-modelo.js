/**
 * dialogo-modelo.js — Janela "Modelo IA". Tem dois modos:
 *   modo 'jogo'   (Criar jogo):  Gemini | OpenRouter — quem PROGRAMA o jogo.
 *   modo 'editor' (editor de pixels): PixelLab (padrão) | SpriteCook | Gemini | OpenRouter — quem DESENHA.
 * Gemini/OpenRouter: chave + poucos modelos RECOMENDADOS (com explicação e botão Testar);
 * a lista completa fica escondida em "Outros modelos", com busca.
 * PixelLab/SpriteCook: chave + "Testar a chave" + "Usar".
 * As chaves ficam só neste aparelho. O modelo do editor e o do Criar jogo são escolhas separadas.
 */

import { h, preencher } from '../ui/dom.js';
import { abrirDialogo } from '../ui/dialogos.js';
import {
  PROVEDORES, OUTRAS_CHAVES, lerChave, gravarChave, modeloEscolhido, escolherModelo, listarModelos, testarPixelLab, testarSpriteCook,
  modeloDoEditor, escolherModeloDoEditor, MODELOS_DE_DESENHO,
} from '../core/ia.js';
import { organizarModelos, resultadoDoTeste, testarModelo } from '../core/modelos-ia.js';

const NOMES = { pixellab: 'PixelLab', spritecook: 'SpriteCook', gemini: 'Gemini', openrouter: 'OpenRouter' };
const ABAS = { jogo: ['gemini', 'openrouter'], editor: ['pixellab', 'spritecook', 'gemini', 'openrouter'] };
const TESTAR_CHAVE = { pixellab: testarPixelLab, spritecook: testarSpriteCook };
const SOBRE = {
  pixellab: 'A PixelLab é uma IA que DESENHA pixel art (personagens, objetos, tilesets) e entende perspectiva isométrica e de cima. É a recomendada para o editor.',
  spritecook: 'A SpriteCook também DESENHA pixel art e consegue refazer uma imagem sua dentro de uma grade (16, 32, 64…). Use se preferir ou se a PixelLab não resolver.',
};

/** Nome curto para o botão: "Gemini · gemini-2.5-flash" ou "PixelLab" */
export function rotuloDoModelo(m = modeloEscolhido()) {
  if (MODELOS_DE_DESENHO[m.provedor]) return NOMES[m.provedor];
  const curto = m.id.length > 28 ? `${m.id.slice(0, 26)}…` : m.id;
  return `${NOMES[m.provedor] || m.provedor} · ${curto}`;
}

/** O modelo escolhido para o modo tem chave? */
export const modeloTemChave = (modo = 'jogo') => !!lerChave((modo === 'editor' ? modeloDoEditor() : modeloEscolhido()).provedor);

const cache = {}; // provedor -> lista (para não buscar de novo a cada abertura)

/** Abre a janela. Devolve o modelo escolhido ou null. */
export function dialogoModelo({ aba = null, modo = 'jogo' } = {}) {
  const editor = modo === 'editor';
  const abasDoModo = ABAS[editor ? 'editor' : 'jogo'];
  const atual = editor ? modeloDoEditor() : modeloEscolhido();
  const escolher = editor ? escolherModeloDoEditor : escolherModelo;
  const ui = {
    aba: abasDoModo.includes(aba) ? aba : (abasDoModo.includes(atual.provedor) ? atual.provedor : abasDoModo[0]),
    escolhido: { ...atual },
    busca: '',
    carregando: false,
    erro: null,
    trocarChave: false,
  };

  return abrirDialogo(({ fechar }) => {
    const abas = h('div', { class: 'grupo-segmentos ia-abas', role: 'tablist', 'aria-label': 'Provedor' });
    const corpo = h('div', { class: 'ia-config' });
    const rodape = h('div', { class: 'dialogo-botoes fixo' });

    function desenhar() {
      preencher(abas, abasDoModo.map((id) => h('button', {
        class: 'segmento', type: 'button', role: 'tab', 'aria-selected': String(ui.aba === id), 'aria-pressed': String(ui.aba === id),
        onclick: () => { ui.aba = id; ui.erro = null; ui.busca = ''; ui.trocarChave = false; desenhar(); carregar(); },
      }, `${NOMES[id]}${lerChave(id) ? ' ✓' : ''}`)));
      if (MODELOS_DE_DESENHO[ui.aba]) desenharDesenhista(); else desenharProvedor();
      desenharRodape();
    }

    /* ---------- chave ---------- */
    function blocoChave(provedor, info) {
      const tem = !!lerChave(provedor);
      if (tem && !ui.trocarChave) {
        return h('div', { class: 'ia-chave-ok' },
          h('span', {}, '🔑 Chave guardada neste aparelho.'),
          h('button', { class: 'link', type: 'button', onclick: () => { ui.trocarChave = true; desenhar(); } }, 'Trocar'),
          h('button', { class: 'link', type: 'button', onclick: () => { gravarChave(provedor, ''); delete cache[provedor]; desenhar(); } }, 'Apagar'));
      }
      const campo = h('input', {
        class: 'campo', id: 'ia-chave', type: 'password', autocomplete: 'off', spellcheck: false, placeholder: 'cole a chave aqui',
      });
      return h('div', { class: 'ia-chave' },
        h('p', { class: 'dica pequena' }, info.dica, ' ', h('a', { href: info.ondePegar, target: '_blank', rel: 'noopener' }, 'Pegar a chave ↗')),
        h('label', { class: 'campo-rotulo', htmlFor: 'ia-chave' }, `Chave do ${info.nome}`),
        h('div', { class: 'ia-linha' }, campo,
          h('button', {
            class: 'botao pequeno', type: 'button',
            onclick: () => {
              if (!campo.value.trim()) { campo.focus(); return; }
              gravarChave(provedor, campo.value);
              ui.trocarChave = false;
              delete cache[provedor];
              desenhar();
              carregar();
            },
          }, 'Salvar chave')),
        h('p', { class: 'dica pequena' }, 'A chave fica só neste aparelho: não vai para a nuvem, nem para o backup, nem para o jogo.'));
    }

    /* ---------- Gemini / OpenRouter ---------- */
    function linhaModelo(m, { comDescricao = true } = {}) {
      const teste = resultadoDoTeste(m);
      const marcado = ui.escolhido.provedor === m.provedor && ui.escolhido.id === m.id;
      const status = h('small', { class: `ia-teste ${teste ? (teste.ok ? 'ok' : 'falhou') : ''}`, 'aria-live': 'polite' },
        teste ? (teste.ok ? `✓ funcionou (${(teste.ms / 1000).toFixed(1)} s)` : `✗ ${teste.erro?.slice(0, 120) || 'falhou'}`) : 'ainda não testado');
      const bTestar = h('button', {
        class: 'botao pequeno', type: 'button',
        onclick: async (ev) => {
          ev.stopPropagation();
          bTestar.disabled = true;
          status.className = 'ia-teste';
          status.textContent = 'testando…';
          await testarModelo(m);
          desenhar();
        },
      }, 'Testar');
      return h('div', {
        class: `ia-modelo-cartao${marcado ? ' marcado' : ''}`, role: 'radio', 'aria-checked': String(marcado), tabIndex: 0,
        onclick: () => { ui.escolhido = { provedor: m.provedor, id: m.id }; desenhar(); },
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ui.escolhido = { provedor: m.provedor, id: m.id }; desenhar(); } },
      },
      h('div', { class: 'ia-modelo-topo' },
        m.papel && h('span', { class: 'ia-papel' }, m.papel),
        (m.selos || (m.gratis ? ['grátis'] : [])).map((s) => h('span', { class: `selo-ia ${s === 'pago' ? 'pago' : ''}` }, s))),
      h('strong', { class: 'ia-modelo-nome' }, m.nome && m.nome !== m.id ? m.nome : m.id),
      h('code', { class: 'ia-modelo-id' }, m.id),
      comDescricao && m.descricao && h('p', { class: 'dica pequena' }, m.descricao),
      h('div', { class: 'ia-modelo-rodape' }, status, bTestar));
    }

    function desenharProvedor() {
      const p = ui.aba;
      const info = PROVEDORES[p];
      const partes = [blocoChave(p, info)];
      const lista = cache[p];
      if (!lerChave(p)) {
        partes.push(h('p', { class: 'dica' }, 'Salve a chave para ver os modelos recomendados.'));
      } else if (ui.carregando && !lista) {
        partes.push(h('p', { class: 'dica' }, 'Carregando os modelos…'));
      } else if (lista) {
        const { recomendados, outros } = organizarModelos(p, lista);
        partes.push(h('div', { class: 'campo-rotulo' }, 'Recomendados (toque para escolher; use “Testar” para ver se funciona com a sua chave)'));
        partes.push(h('div', { class: 'ia-modelos', role: 'radiogroup', 'aria-label': 'Modelos recomendados' },
          recomendados.length ? recomendados.map((m) => linhaModelo(m)) : h('p', { class: 'dica' }, 'Nenhum recomendado encontrado: veja “Outros modelos”.')));
        const termo = ui.busca.trim().toLowerCase();
        const filtrados = outros.filter((m) => !termo || `${m.id} ${m.nome}`.toLowerCase().includes(termo));
        const busca = h('input', {
          class: 'campo', type: 'search', placeholder: p === 'openrouter' ? 'buscar (ex.: free, qwen, claude)' : 'buscar', value: ui.busca,
          oninput: (e) => { ui.busca = e.target.value; const pos = e.target.selectionStart; desenhar(); const novo = corpo.querySelector('.ia-busca input'); novo?.focus(); novo?.setSelectionRange(pos, pos); },
        });
        partes.push(h('details', { class: 'ia-todos', open: !!termo },
          h('summary', {}, `Outros modelos (${outros.length}) — para quem sabe o que quer`),
          h('div', { class: 'ia-busca' }, busca),
          h('div', { class: 'ia-modelos compacto' }, filtrados.slice(0, 60).map((m) => linhaModelo(m, { comDescricao: false })),
            filtrados.length > 60 && h('p', { class: 'dica pequena' }, `…e mais ${filtrados.length - 60}. Use a busca.`))));
      }
      if (ui.erro) partes.push(h('p', { class: 'campo-erro', role: 'alert' }, ui.erro));
      partes.push(h('details', { class: 'ia-ajuda' },
        h('summary', {}, 'Por que alguns modelos dão erro?'),
        h('ul', { class: 'lista-simples pequena' },
          h('li', {}, 'Modelos grátis têm limite de pedidos por minuto e por dia. Ao passar, dá erro de “limite”: espere ou troque de modelo.'),
          h('li', {}, 'Cada correção automática do jogo também é um pedido. Um pedido seu pode virar até 4.'),
          h('li', {}, 'Versões “preview” e “exp” são de teste: mudam ou somem sem aviso. Prefira os recomendados.'),
          h('li', {}, 'Alguns modelos só funcionam com crédito pago ou em certas contas. O botão Testar mostra isso antes de você usar.'))));
      preencher(corpo, partes);
    }

    async function carregar() {
      const p = ui.aba;
      if (MODELOS_DE_DESENHO[p] || !lerChave(p) || cache[p] || ui.carregando) return;
      ui.carregando = true;
      ui.erro = null;
      desenhar();
      try {
        cache[p] = await listarModelos(p);
        const { recomendados } = organizarModelos(p, cache[p]);
        // se o escolhido não é deste provedor (ou sumiu), sugere o primeiro recomendado
        if (ui.escolhido.provedor !== p || !cache[p].some((m) => m.id === ui.escolhido.id)) {
          if (recomendados[0]) ui.escolhido = { provedor: p, id: recomendados[0].id };
        }
      } catch (x) {
        ui.erro = `Não consegui carregar os modelos: ${x.message}`;
      } finally {
        ui.carregando = false;
        if (ui.aba === p) desenhar();
      }
    }

    /* ---------- PixelLab / SpriteCook ---------- */
    function desenharDesenhista() {
      const p = ui.aba;
      const status = h('p', { class: 'dica', role: 'status' });
      const tem = !!lerChave(p);
      ui.escolhido = { ...MODELOS_DE_DESENHO[p] };
      preencher(corpo,
        h('p', { class: 'dica' }, SOBRE[p]),
        blocoChave(p, OUTRAS_CHAVES[p]),
        tem && h('button', {
          class: 'botao', type: 'button',
          onclick: async () => { status.textContent = 'Testando…'; status.textContent = (await TESTAR_CHAVE[p]()).texto; },
        }, 'Testar a chave (consulta o saldo)'),
        status);
    }

    /* ---------- rodapé ---------- */
    function desenharRodape() {
      const desenhista = !!MODELOS_DE_DESENHO[ui.aba];
      const pode = !!lerChave(ui.escolhido.provedor) && ui.escolhido.provedor === ui.aba;
      const rotulo = desenhista ? `Usar ${NOMES[ui.aba]}` : (pode ? `Usar ${ui.escolhido.id.length > 22 ? `${ui.escolhido.id.slice(0, 20)}…` : ui.escolhido.id}` : 'Usar este modelo');
      preencher(rodape,
        h('button', { class: 'botao', type: 'button', onclick: () => fechar(null) }, 'Cancelar'),
        h('button', {
          class: 'botao primario', type: 'button', disabled: !pode,
          onclick: () => { escolher(ui.escolhido); fechar(ui.escolhido); },
        }, rotulo));
    }

    desenhar();
    carregar();
    return [
      h('h2', { class: 'dialogo-titulo' }, editor ? 'Modelo IA do editor' : 'Modelo IA'),
      h('p', { class: 'dialogo-sub' }, `Em uso agora: ${rotuloDoModelo(atual)}`),
      abas,
      corpo,
      rodape,
    ];
  });
}
