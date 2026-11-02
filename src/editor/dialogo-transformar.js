/**
 * dialogo-transformar.js — Tela "Transformar imagem" do editor de pixels.
 *
 *  1. Sobe uma imagem (PNG, JPG, WebP…).
 *  2. Escolhe quem faz: Mini Engine (sem IA, grátis), PixelLab ou SpriteCook (com lugar para a chave).
 *  3. Escolhe a escala (16×16, 32×32, 64×64, 128×128…) ou "Manter".
 *  4. Escolhe a perspectiva: isométrico, top down (de frente) ou nenhuma.
 *  Sem escala e sem perspectiva: a imagem volta EXATAMENTE como é, só que dentro da grade de pixels
 *  (feito aqui no app, sem gastar IA). Com IA, a resposta passa pelo mesmo acabamento (pixelizar.js):
 *  sempre volta encaixada na grade escolhida — uma imagem 64×64 com escala 32×32 é reduzida para caber.
 *
 * Devolve { rgba, largura, altura, nome } (a arte pronta) ou null. Quem decide onde ela entra
 * (frame novo, desenho novo) é a tela do editor.
 */

import { h, preencher } from '../ui/dom.js';
import { abrirDialogo } from '../ui/dialogos.js';
import { mensagemDeErro } from '../ui/toast.js';
import { lerChave, gravarChave, OUTRAS_CHAVES, modeloDoEditor } from '../core/ia.js';
import { imagemDeArquivo } from './importar.js';
import { prepararArte, encaixar } from './pixelizar.js';
import { codificarPng } from './png.js';
import { pintarPrevia } from './dialogos-arquivo.js';
import { contarCores } from './imagem.js';
import { MAX_CORES } from './documento.js';
import {
  ESCALAS, PERSPECTIVAS, transformarComPixelLab, transformarComSpriteCook, ladoParaPixelLab, ErroDeDesenho,
} from './transformar-ia.js';

const MOTORES = {
  local: { nome: 'Mini Engine', nota: 'sem IA · grátis · na hora', dica: 'Usa as ferramentas do próprio editor: põe a imagem na grade, reduz para a escala e acerta as cores. Não muda o desenho (não faz perspectiva).' },
  pixellab: { nome: 'PixelLab', nota: 'IA · recomendada', dica: 'A IA redesenha a imagem como pixel art, entende isométrico e top down. Gasta créditos da sua conta PixelLab.' },
  spritecook: { nome: 'SpriteCook', nota: 'IA', dica: 'A IA refaz a sua imagem dentro da grade escolhida. Gasta créditos da sua conta SpriteCook.' },
};
const LADO_MAX_ENVIO = 512; // a imagem enviada à IA é reduzida até este lado (mais rápido e barato)

/* ---------- conversões (navegador) ---------- */

function base64DeBytes(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function rgbaDeBase64(base64) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const arquivo = new File([bytes], 'ia.png', { type: 'image/png' });
  return imagemDeArquivo(arquivo);
}

async function baixarComoBase64(url) {
  let r;
  try { r = await fetch(url); } catch { throw new ErroDeDesenho('A IA terminou, mas o navegador não deixou baixar a imagem do resultado.'); }
  if (!r.ok) throw new ErroDeDesenho(`Não consegui baixar a imagem do resultado (${r.status}).`);
  return base64DeBytes(new Uint8Array(await r.arrayBuffer()));
}

/** Reduz (sem deformar) para no máximo `lado` e devolve PNG base64. */
async function pngParaEnviar(img, lado) {
  const f = Math.min(1, lado / Math.max(img.largura, img.altura));
  const L = Math.max(1, Math.round(img.largura * f)), A = Math.max(1, Math.round(img.altura * f));
  const rgba = f < 1 ? encaixar(img.rgba, img.largura, img.altura, L, A) : img.rgba;
  return base64DeBytes(await codificarPng({ rgba, largura: L, altura: A }));
}

/** Imagem quadrada lado×lado com a arte centralizada (o que a PixelLab espera como imagem inicial). */
async function pngQuadrado(img, lado) {
  const rgba = encaixar(img.rgba, img.largura, img.altura, lado, lado);
  return base64DeBytes(await codificarPng({ rgba, largura: lado, altura: lado }));
}

/* ---------- a tela ---------- */

/**
 * @param tamanhoAtual  { largura, altura } do desenho aberto (só para mostrar), ou null
 */
export function dialogoTransformar({ tamanhoAtual = null } = {}) {
  const preferido = modeloDoEditor().provedor;
  const ui = {
    img: null,           // { rgba, largura, altura, nome }
    motor: preferido === 'spritecook' ? 'spritecook' : 'pixellab',
    escala: null,        // null = manter
    perspectiva: null,   // null | 'isometrico' | 'frente'
    resultado: null,     // { rgba, largura, altura, nome, custo }
    trabalhando: false,
    trocarChave: false,
  };
  const controle = { cancelar: null };

  return abrirDialogo(({ fechar }) => {
    const corpo = h('div', { class: 'transformar' });
    const entradaArquivo = h('input', {
      type: 'file', accept: 'image/*', hidden: true,
      onchange: async () => {
        const arq = entradaArquivo.files?.[0];
        entradaArquivo.value = '';
        if (!arq) return;
        try {
          ui.img = await imagemDeArquivo(arq);
          ui.resultado = null;
          ui.erro = null;
        } catch (x) { ui.erro = mensagemDeErro(x); }
        desenhar();
      },
    });

    const sair = (valor) => { controle.cancelar?.(); fechar(valor); };

    /** O que vai acontecer de fato (sem escala e sem perspectiva = cópia exata, sem IA). */
    const usaIA = () => ui.motor !== 'local' && (ui.escala !== null || ui.perspectiva !== null);

    function passo(numero, titulo, ...conteudo) {
      return h('section', { class: 'tr-passo' },
        h('h3', { class: 'tr-passo-titulo' }, h('span', { class: 'tr-numero', 'aria-hidden': 'true' }, String(numero)), titulo),
        ...conteudo);
    }

    function segmento(rotulo, ativo, ao, extra = {}) {
      return h('button', { class: 'segmento', type: 'button', 'aria-pressed': String(ativo), onclick: ao, ...extra }, rotulo);
    }

    function blocoChave(provedor) {
      const info = OUTRAS_CHAVES[provedor];
      if (lerChave(provedor) && !ui.trocarChave) {
        return h('div', { class: 'ia-chave-ok' },
          h('span', {}, `🔑 Chave da ${info.nome} guardada neste aparelho.`),
          h('button', { class: 'link', type: 'button', onclick: () => { ui.trocarChave = true; desenhar(); } }, 'Trocar'));
      }
      const campo = h('input', {
        class: 'campo', id: `tr-chave-${provedor}`, type: 'password', autocomplete: 'off', spellcheck: false,
        placeholder: provedor === 'spritecook' ? 'sc_live_…' : 'cole a chave aqui',
      });
      return h('div', { class: 'ia-chave' },
        h('label', { class: 'campo-rotulo', htmlFor: `tr-chave-${provedor}` }, `Chave da API da ${info.nome}`),
        h('div', { class: 'ia-linha' }, campo,
          h('button', {
            class: 'botao pequeno', type: 'button',
            onclick: () => {
              if (!campo.value.trim()) { campo.focus(); return; }
              gravarChave(provedor, campo.value);
              ui.trocarChave = false;
              desenhar();
            },
          }, 'Salvar chave')),
        h('p', { class: 'dica pequena' }, info.dica, ' ', h('a', { href: info.ondePegar, target: '_blank', rel: 'noopener' }, 'Pegar a chave ↗'),
          ' A chave fica só neste aparelho.'));
    }

    function desenhar() {
      const partes = [];

      // 1. imagem
      const previa = h('canvas', { class: 'tr-previa-canvas', role: 'img', 'aria-label': 'Imagem escolhida' });
      if (ui.img) pintarPrevia(previa, ui.img, 160, 120);
      partes.push(passo(1, 'Imagem',
        h('div', { class: 'tr-imagem' },
          ui.img && h('div', { class: 'tr-previa' }, previa),
          h('div', { class: 'tr-imagem-info' },
            ui.img && h('p', { class: 'dica pequena' }, `${ui.img.nome} · ${ui.img.largura}×${ui.img.altura} px`),
            h('button', {
              class: `botao${ui.img ? '' : ' primario'}`, type: 'button', 'data-foco': '',
              onclick: () => entradaArquivo.click(),
            }, ui.img ? 'Trocar a imagem' : '🖼 Escolher a imagem')))));

      // 2. quem faz
      partes.push(passo(2, 'Quem faz o serviço',
        h('div', { class: 'tr-motores', role: 'radiogroup', 'aria-label': 'Quem faz o serviço' },
          Object.entries(MOTORES).map(([id, m]) => h('button', {
            class: `tr-motor${ui.motor === id ? ' marcado' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(ui.motor === id),
            onclick: () => { ui.motor = id; ui.trocarChave = false; if (id === 'local') ui.perspectiva = null; desenhar(); },
          }, h('strong', {}, m.nome, id !== 'local' && lerChave(id) ? ' ✓' : ''), h('small', {}, m.nota)))),
        h('p', { class: 'dica pequena' }, MOTORES[ui.motor].dica),
        ui.motor !== 'local' && blocoChave(ui.motor)));

      // 3. escala
      partes.push(passo(3, 'Escala (tamanho da grade)',
        h('div', { class: 'grupo-segmentos', role: 'group', 'aria-label': 'Escala' },
          segmento('Manter', ui.escala === null, () => { ui.escala = null; desenhar(); }),
          ESCALAS.map((n) => segmento(`${n}×${n}`, ui.escala === n, () => { ui.escala = n; desenhar(); }))),
        h('p', { class: 'dica pequena' }, ui.escala
          ? `A arte fica numa grade de ${ui.escala}×${ui.escala}. Se a imagem for maior, tudo é reduzido para caber; se for menor, é ampliada por número inteiro e centralizada.`
          : 'A imagem fica com o tamanho que já tem (se for pixel art ampliada, volta ao tamanho original; acima de 128 px, é reduzida até caber).')));

      // 4. perspectiva
      partes.push(passo(4, 'Perspectiva',
        h('div', { class: 'grupo-segmentos', role: 'group', 'aria-label': 'Perspectiva' },
          segmento('Nenhuma', ui.perspectiva === null, () => { ui.perspectiva = null; desenhar(); }),
          Object.entries(PERSPECTIVAS).map(([id, p]) => segmento(p.nome, ui.perspectiva === id, () => {
            ui.perspectiva = id;
            if (ui.motor === 'local') ui.motor = 'pixellab';
            desenhar();
          }))),
        ui.perspectiva && ui.motor === 'local' && h('p', { class: 'dica pequena' }, 'Perspectiva precisa de IA.'),
        h('label', { class: 'campo-rotulo', htmlFor: 'tr-descricao' }, 'O que tem na imagem? (opcional, ajuda a IA)'),
        h('input', {
          class: 'campo', id: 'tr-descricao', type: 'text', maxLength: 120, value: ui.descricao || '', placeholder: 'ex.: cavaleiro com espada e escudo',
          disabled: ui.motor === 'local',
          oninput: (e) => { ui.descricao = e.target.value; },
        }),
        h('label', { class: 'tr-check' },
          h('input', { type: 'checkbox', checked: ui.tirarFundo !== false, onchange: (e) => { ui.tirarFundo = e.target.checked; } }),
          ' Tirar o fundo liso (a cor que domina as bordas vira transparente)')));

      // resumo do que vai acontecer
      const resumo = !ui.img ? 'Escolha uma imagem para começar.'
        : !usaIA()
          ? (ui.motor !== 'local' && ui.escala === null && ui.perspectiva === null
            ? 'Sem escala e sem perspectiva: a imagem volta exatamente como é, só que editável dentro da grade de pixels (feito aqui no app, sem gastar a IA).'
            : 'Feito aqui no app, sem IA.')
          : `A ${MOTORES[ui.motor].nome} vai redesenhar a imagem${ui.perspectiva ? ` em ${PERSPECTIVAS[ui.perspectiva].nome.toLowerCase()}` : ''} e o app encaixa o resultado na grade${ui.escala ? ` de ${ui.escala}×${ui.escala}` : ''}.`;
      partes.push(h('p', { class: 'aviso-caixa tr-resumo', role: 'note' }, resumo));

      if (ui.erro) partes.push(h('p', { class: 'campo-erro', role: 'alert' }, ui.erro));
      if (ui.trabalhando) partes.push(h('p', { class: 'dica tr-status', role: 'status' }, ui.trabalhando));

      // resultado
      if (ui.resultado) {
        const c = h('canvas', { class: 'tr-previa-canvas', role: 'img', 'aria-label': 'Resultado na grade de pixels' });
        pintarPrevia(c, ui.resultado, 260, 200);
        const r = ui.resultado;
        partes.push(h('section', { class: 'tr-passo tr-resultado', 'data-rolar': '' },
          h('h3', { class: 'tr-passo-titulo' }, '✅ Resultado'),
          h('div', { class: 'tr-previa xadrez' }, c),
          h('p', { class: 'dica pequena' },
            `${r.largura}×${r.altura} px · ${r.cores} ${r.cores === 1 ? 'cor' : 'cores'}${r.custo ? ` · custo: ${r.custo}` : ''}.`,
            tamanhoAtual && (tamanhoAtual.largura !== r.largura || tamanhoAtual.altura !== r.altura)
              ? ` Seu desenho é ${tamanhoAtual.largura}×${tamanhoAtual.altura}: no próximo passo você escolhe onde ela entra.` : '')));
      }

      preencher(corpo, partes);
      desenharRodape();
      // o resultado (ou o erro) aparece no fim da tela: rola até ele
      const alvo = corpo.querySelector('[data-rolar], .campo-erro');
      if (alvo && ui.rolar) { ui.rolar = false; requestAnimationFrame(() => alvo.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); }
    }

    const rodape = h('div', { class: 'dialogo-botoes fixo' });
    function desenharRodape() {
      const cancelar = h('button', { class: 'botao', type: 'button', onclick: () => sair(null) }, ui.trabalhando ? 'Cancelar' : 'Fechar');
      if (ui.resultado && !ui.trabalhando) {
        preencher(rodape, cancelar,
          h('button', { class: 'botao', type: 'button', onclick: () => { ui.resultado = null; desenhar(); } }, 'Refazer'),
          h('button', { class: 'botao primario', type: 'button', onclick: () => sair(ui.resultado) }, 'Pôr no editor'));
        return;
      }
      preencher(rodape, cancelar,
        h('button', {
          class: 'botao primario', type: 'button', disabled: !ui.img || !!ui.trabalhando,
          onclick: () => transformar(),
        }, ui.trabalhando ? 'Transformando…' : '✨ Transformar'));
    }

    async function transformar() {
      if (!ui.img) return;
      ui.erro = null;
      ui.resultado = null;
      const tirarFundo = ui.tirarFundo === false ? false : 'auto';
      try {
        let arte;
        let custo = null;
        if (!usaIA()) {
          arte = prepararArte(ui.img, { escala: ui.escala, tirarFundo });
        } else {
          // lado da grade: a escala escolhida, ou o tamanho natural da imagem
          const natural = prepararArte(ui.img, { tirarFundo: false });
          const lado = ui.escala || Math.max(16, Math.min(128, Math.max(natural.largura, natural.altura)));
          const sinal = new AbortController();
          controle.cancelar = () => sinal.abort();
          ui.trabalhando = `A ${MOTORES[ui.motor].nome} está redesenhando… (pode levar até 1 minuto)`;
          desenhar();
          let resposta;
          if (ui.motor === 'pixellab') {
            const L = ladoParaPixelLab(lado);
            const base = natural.largura >= L || natural.altura >= L ? ui.img : natural;
            resposta = await transformarComPixelLab({
              pngBase64: await pngQuadrado(base, L), lado, perspectiva: ui.perspectiva, descricao: ui.descricao || '', sinal: sinal.signal,
            });
          } else {
            resposta = await transformarComSpriteCook({
              pngBase64: await pngParaEnviar(ui.img, LADO_MAX_ENVIO), lado, perspectiva: ui.perspectiva, descricao: ui.descricao || '',
              sinal: sinal.signal, baixar: baixarComoBase64,
            });
          }
          custo = resposta.custo;
          const devolvida = await rgbaDeBase64(resposta.base64);
          arte = prepararArte(devolvida, ui.escala ? { escala: ui.escala, tirarFundo } : { tamanho: { largura: lado, altura: lado }, tirarFundo });
        }
        const cores = contarCores(arte.rgba).size;
        ui.resultado = {
          rgba: arte.rgba, largura: arte.largura, altura: arte.altura, nome: ui.img.nome, custo,
          cores, muitasCores: cores > MAX_CORES - 1,
        };
      } catch (x) {
        ui.erro = mensagemDeErro(x);
      } finally {
        ui.trabalhando = false;
        controle.cancelar = null;
      }
      ui.rolar = true;
      desenhar();
    }

    desenhar();
    return [
      h('h2', { class: 'dialogo-titulo' }, 'Transformar imagem'),
      h('p', { class: 'dialogo-sub' }, 'Sua imagem vira pixel art editável, dentro da grade, num frame novo.'),
      entradaArquivo,
      corpo,
      rodape,
    ];
  });
}
