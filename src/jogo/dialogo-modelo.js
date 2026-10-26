/**
 * dialogo-modelo.js — Janela "Modelo IA": chaves de API (só neste aparelho) e escolha do modelo.
 */

import { h, preencher } from '../ui/dom.js';
import { abrirDialogo } from '../ui/dialogos.js';
import {
  PROVEDORES, OUTRAS_CHAVES, lerChave, gravarChave, modeloEscolhido, escolherModelo, listarModelos, testarPixelLab,
} from '../core/ia.js';

/** Nome curto para o botão: "Gemini · gemini-2.5-flash" */
export function rotuloDoModelo(m = modeloEscolhido()) {
  const curto = m.id.length > 28 ? `${m.id.slice(0, 26)}…` : m.id;
  return `${m.provedor === 'gemini' ? 'Gemini' : 'OpenRouter'} · ${curto}`;
}

/** Abre a janela. Devolve o modelo escolhido ou null. */
export function dialogoModelo() {
  const atual = modeloEscolhido();
  const ui = { provedor: atual.provedor, id: atual.id, lista: [], soGratis: false };

  return abrirDialogo(({ fechar }) => {
    const abas = h('div', { class: 'grupo-segmentos', role: 'group', 'aria-label': 'Provedor' });
    const corpo = h('div', { class: 'ia-config' });
    const erro = h('p', { class: 'campo-erro', role: 'alert', hidden: true });
    const outras = h('details', { class: 'ia-outras' });

    function desenharOutras() {
      const p = OUTRAS_CHAVES.pixellab;
      const campo = h('input', {
        class: 'campo', id: 'pixellab-chave', type: 'password', autocomplete: 'off', spellcheck: false,
        placeholder: lerChave('pixellab') ? 'chave guardada (cole outra para trocar)' : 'cole o API token aqui',
      });
      const status = h('p', { class: 'dica pequena', role: 'status' });
      preencher(outras,
        h('summary', {}, `Chave da PixelLab (gerar pixel art)${lerChave('pixellab') ? ' ✓' : ''}`),
        h('p', { class: 'dica pequena' }, p.dica, ' ', h('a', { href: p.ondePegar, target: '_blank', rel: 'noopener' }, 'Pegar a chave ↗')),
        h('div', { class: 'ia-linha' }, campo,
          h('button', {
            class: 'botao pequeno', type: 'button',
            onclick: async () => {
              if (campo.value.trim()) gravarChave('pixellab', campo.value);
              if (!lerChave('pixellab')) { status.textContent = 'Cole a chave no campo.'; return; }
              status.textContent = 'Testando…';
              const r = await testarPixelLab();
              desenharOutras();
              outras.open = true;
              outras.querySelector('[role=status]').textContent = r.texto;
            },
          }, 'Salvar e testar')),
        lerChave('pixellab') && h('button', { class: 'link', type: 'button', onclick: () => { gravarChave('pixellab', ''); desenharOutras(); outras.open = true; } }, 'Apagar a chave da PixelLab deste aparelho'),
        status,
        h('p', { class: 'dica pequena' }, 'Fica só neste aparelho, como as outras chaves. Ela será usada pelo “Solicitar IA” dos sprites.'));
    }
    desenharOutras();

    function desenhar() {
      preencher(abas, Object.entries(PROVEDORES).map(([id, p]) => h('button', {
        class: 'segmento', type: 'button', 'aria-pressed': String(id === ui.provedor),
        onclick: () => {
          if (ui.provedor === id) return;
          ui.provedor = id;
          ui.id = id === atual.provedor ? atual.id : p.padrao;
          ui.lista = [];
          desenhar();
        },
      }, `${p.nome}${lerChave(id) ? ' ✓' : ''}`)));

      const p = PROVEDORES[ui.provedor];
      const chave = h('input', {
        class: 'campo', id: 'ia-chave', type: 'password', autocomplete: 'off', spellcheck: false,
        placeholder: lerChave(ui.provedor) ? 'chave guardada (cole outra para trocar)' : 'cole a chave aqui',
      });
      const mostrar = h('button', {
        class: 'botao pequeno', type: 'button',
        onclick: () => { chave.type = chave.type === 'password' ? 'text' : 'password'; },
      }, '👁');
      const salvarChave = h('button', {
        class: 'botao pequeno', type: 'button',
        onclick: () => {
          if (!chave.value.trim()) { erro.textContent = 'Cole a chave no campo antes de salvar.'; erro.hidden = false; return; }
          gravarChave(ui.provedor, chave.value);
          erro.hidden = true;
          desenhar();
          carregar();
        },
      }, 'Salvar chave');
      const apagarChave = lerChave(ui.provedor) && h('button', {
        class: 'link', type: 'button',
        onclick: () => { gravarChave(ui.provedor, ''); ui.lista = []; desenhar(); },
      }, 'Apagar a chave deste aparelho');

      const seletor = h('select', { class: 'campo', id: 'ia-modelo', onchange: (e) => { ui.id = e.target.value; manual.value = ui.id; } });
      const visiveis = ui.lista.filter((m) => !ui.soGratis || m.gratis);
      const opcoes = visiveis.length ? visiveis : [{ id: ui.id, nome: ui.id }];
      if (!opcoes.some((m) => m.id === ui.id)) opcoes.unshift({ id: ui.id, nome: ui.id });
      for (const m of opcoes) {
        seletor.append(h('option', { value: m.id, selected: m.id === ui.id },
          `${m.nome}${m.gratis ? ' (grátis)' : ''}${m.nome !== m.id ? ` — ${m.id}` : ''}`));
      }
      const manual = h('input', {
        class: 'campo', id: 'ia-modelo-manual', type: 'text', value: ui.id, spellcheck: false,
        oninput: (e) => { ui.id = e.target.value.trim(); },
      });

      preencher(corpo, [
        h('p', { class: 'dica pequena' }, p.dica, ' ',
          h('a', { href: p.ondePegar, target: '_blank', rel: 'noopener' }, 'Pegar a chave ↗')),
        h('label', { class: 'campo-rotulo', htmlFor: 'ia-chave' }, `Chave do ${p.nome}`),
        h('div', { class: 'ia-linha' }, chave, mostrar, salvarChave),
        apagarChave,
        h('p', { class: 'dica pequena' }, 'A chave fica só neste aparelho: não vai para a nuvem, nem para o backup, nem para o jogo. No outro aparelho, cole de novo.'),
        h('label', { class: 'campo-rotulo', htmlFor: 'ia-modelo' }, 'Modelo'),
        seletor,
        ui.provedor === 'openrouter' && ui.lista.length > 0 && h('label', { class: 'exp-marca' },
          h('input', { type: 'checkbox', checked: ui.soGratis, onchange: (e) => { ui.soGratis = e.target.checked; desenhar(); } }),
          h('span', {}, 'Mostrar só os grátis'), h('small', {}, 'os grátis têm limite de uso por dia')),
        h('details', { class: 'ia-manual' }, h('summary', {}, 'Digitar o nome do modelo'), manual),
        lerChave(ui.provedor) && !ui.lista.length && h('button', { class: 'link', type: 'button', onclick: () => carregar() }, 'Carregar a lista de modelos'),
      ]);
    }

    async function carregar() {
      if (!lerChave(ui.provedor) && ui.provedor === 'gemini') return;
      erro.hidden = true;
      try {
        ui.lista = await listarModelos(ui.provedor);
        if (ui.lista.length && !ui.lista.some((m) => m.id === ui.id)) {
          const preferido = ui.lista.find((m) => m.id === PROVEDORES[ui.provedor].padrao)
            || ui.lista.find((m) => /flash/.test(m.id) && !/lite|preview|exp/.test(m.id)) || ui.lista[0];
          ui.id = preferido.id;
        }
      } catch (x) {
        erro.textContent = `Não consegui carregar os modelos: ${x.message}`;
        erro.hidden = false;
      }
      desenhar();
    }

    desenhar();
    if (lerChave(ui.provedor)) carregar();

    return [
      h('h2', { class: 'dialogo-titulo' }, 'Modelo IA'),
      h('p', { class: 'dialogo-sub' }, 'Escolha quem programa o jogo.'),
      abas,
      corpo,
      outras,
      erro,
      h('div', { class: 'dialogo-botoes fixo' },
        h('button', { class: 'botao', type: 'button', onclick: () => fechar(null) }, 'Cancelar'),
        h('button', {
          class: 'botao primario', type: 'button',
          onclick: () => {
            if (!lerChave(ui.provedor)) { erro.textContent = `Salve a chave do ${PROVEDORES[ui.provedor].nome} primeiro.`; erro.hidden = false; return; }
            if (!ui.id) { erro.textContent = 'Escolha um modelo.'; erro.hidden = false; return; }
            const m = { provedor: ui.provedor, id: ui.id };
            escolherModelo(m);
            fechar(m);
          },
        }, 'Usar este modelo')),
    ];
  });
}
