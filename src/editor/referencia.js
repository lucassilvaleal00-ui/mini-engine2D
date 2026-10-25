/**
 * referencia.js — Imagem de inspiração: um painel ao lado do desenho onde você vê uma
 * imagem sua para copiar cores e formas. Tocar/clicar na imagem pega a cor (conta-gotas).
 *
 * A imagem acompanha o projeto: fica guardada no primeiro frame salvo (e no rascunho)
 * e volta quando o desenho é aberto de novo. Ela nunca entra nos PNG/GIF exportados.
 */

import { h, preencher } from '../ui/dom.js';
import { confirmar } from '../ui/dialogos.js';
import { aviso, avisarErro } from '../ui/toast.js';
import { icone } from './icones.js';
import { ErroDoEditor, REFERENCIA_MAX_CHARS, rgbParaHex } from './documento.js';

const LADO_MAX = 1280;       // maior lado guardado (imagens maiores são reduzidas)
const BYTES_MAX = 25 * 1024 * 1024;
const TAMANHOS = [0.38, 0.5, 0.62];

/* ------------------------------------------------------------------ */
/* Preparar a imagem escolhida                                         */
/* ------------------------------------------------------------------ */

const paraBlob = (canvas, tipo, qualidade) => new Promise((ok) => canvas.toBlob(ok, tipo, qualidade));
const lerComoDataUrl = (blob) => new Promise((ok, falha) => {
  const leitor = new FileReader();
  leitor.onload = () => ok(leitor.result);
  leitor.onerror = () => falha(leitor.error);
  leitor.readAsDataURL(blob);
});

/** Arquivo de imagem -> { nome, dados (data URL), largura, altura } pronto para guardar no projeto. */
export async function prepararImagem(arquivo) {
  if (!arquivo || !/^image\//.test(arquivo.type)) {
    throw new ErroDoEditor('Escolha um arquivo de imagem (PNG, JPG, WebP ou GIF).');
  }
  if (arquivo.size > BYTES_MAX) throw new ErroDoEditor('Essa imagem é grande demais (máximo 25 MB).');
  let bmp;
  try {
    bmp = await createImageBitmap(arquivo);
  } catch {
    throw new ErroDoEditor('Não consegui abrir essa imagem. Ela pode estar corrompida ou em um formato que o navegador não lê.');
  }

  let lado = LADO_MAX;
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * escala));
    const hh = Math.max(1, Math.round(bmp.height * escala));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = hh;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = escala < 1;
    ctx.drawImage(bmp, 0, 0, w, hh);

    let blob = await paraBlob(canvas, 'image/png');
    const pixels = ctx.getImageData(0, 0, w, hh).data;
    let temAlfa = false;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 255) { temAlfa = true; break; }
    if (!temAlfa && blob.size > 400_000) {
      const jpg = await paraBlob(canvas, 'image/jpeg', 0.92);
      if (jpg && jpg.size < blob.size) blob = jpg;
    }
    const dados = await lerComoDataUrl(blob);
    if (dados.length <= REFERENCIA_MAX_CHARS) {
      bmp.close?.();
      return { nome: (arquivo.name || 'imagem').slice(0, 80), dados, largura: w, altura: hh };
    }
    lado = Math.floor(lado * 0.7); // ainda pesada: reduz mais e tenta de novo
  }
  bmp.close?.();
  throw new ErroDoEditor('Não consegui reduzir essa imagem o bastante para guardar no projeto. Tente uma imagem menor.');
}

/* ------------------------------------------------------------------ */
/* Vista da imagem (zoom, mover, pegar cor)                            */
/* ------------------------------------------------------------------ */

class VistaImagem {
  constructor(palco, { aoPegar, aoPassar }) {
    this.palco = palco;
    this.aoPegar = aoPegar;
    this.aoPassar = aoPassar;
    this.canvas = h('canvas', { class: 'ref-canvas', 'aria-label': 'Imagem de inspiração: toque para pegar uma cor' });
    this.ctx = this.canvas.getContext('2d');
    // Sem imagem, o canvas fica escondido: senão ele cobre o botão "Adicionar imagem" e o clique não chega nele.
    this.canvas.hidden = true;
    palco.append(this.canvas);
    this.img = null;       // canvas com a imagem em tamanho real
    this.leitor = null;    // contexto de leitura de pixels
    this.zoom = 1; this.px = 0; this.py = 0;
    this._auto = true;
    this.marca = null;     // { x, y } do último pixel escolhido
    this.hover = null;
    this._ponteiros = new Map();
    this._gesto = null;
    this._agendado = 0;
    this.cw = this.ch = 1;

    this._ligar();
    this._obs = new ResizeObserver(() => this._redimensionar());
    this._obs.observe(palco);
  }

  destruir() {
    this._obs.disconnect();
    cancelAnimationFrame(this._agendado);
    this.canvas.remove();
  }

  /** Carrega uma imagem (data URL). Devolve uma promessa que resolve quando estiver pronta. */
  async definir(dados) {
    this.marca = null;
    this.hover = null;
    if (!dados) { this.img = null; this.leitor = null; this.canvas.hidden = true; this.desenhar(); return; }
    const imagem = new Image();
    imagem.src = dados;
    await imagem.decode();
    const c = document.createElement('canvas');
    c.width = imagem.naturalWidth;
    c.height = imagem.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(imagem, 0, 0);
    this.img = c;
    this.leitor = ctx;
    this.canvas.hidden = false;
    this._auto = true;
    this.ajustar();
  }

  _redimensionar() {
    const r = this.palco.getBoundingClientRect();
    this.cw = Math.max(1, Math.floor(r.width));
    this.ch = Math.max(1, Math.floor(r.height));
    const dpr = window.devicePixelRatio || 1;
    this.dpr = dpr;
    this.canvas.width = Math.round(this.cw * dpr);
    this.canvas.height = Math.round(this.ch * dpr);
    this.canvas.style.width = `${this.cw}px`;
    this.canvas.style.height = `${this.ch}px`;
    if (this._auto) this.ajustar(); else this.desenhar();
  }

  ajustar() {
    if (!this.img) { this.desenhar(); return; }
    const margem = 8;
    let z = Math.min((this.cw - margem * 2) / this.img.width, (this.ch - margem * 2) / this.img.height);
    if (z >= 1) z = Math.floor(z); // imagens pequenas ficam nítidas (pixel inteiro)
    this.zoom = Math.max(0.02, z);
    this.px = (this.cw - this.img.width * this.zoom) / 2;
    this.py = (this.ch - this.img.height * this.zoom) / 2;
    this._auto = true;
    this.desenhar();
  }

  zoomPara(novo, cx = this.cw / 2, cy = this.ch / 2) {
    novo = Math.max(0.02, Math.min(64, novo));
    const fx = (cx - this.px) / this.zoom;
    const fy = (cy - this.py) / this.zoom;
    this.zoom = novo;
    this.px = cx - fx * novo;
    this.py = cy - fy * novo;
    this._auto = false;
    this.desenhar();
  }

  desenhar() {
    if (this._agendado) return;
    this._agendado = requestAnimationFrame(() => { this._agendado = 0; this._desenhar(); });
  }

  _desenhar() {
    const { ctx, dpr = 1 } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.cw, this.ch);
    if (!this.img) return;
    const w = this.img.width * this.zoom;
    const hh = this.img.height * this.zoom;
    // xadrez atrás (imagens com transparência)
    ctx.fillStyle = '#2a2d44';
    ctx.fillRect(this.px, this.py, w, hh);
    ctx.fillStyle = '#353a58';
    const q = 8;
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.px, this.py, w, hh);
    ctx.clip();
    for (let y = 0; y * q < hh; y++) {
      for (let x = (y % 2); x * q < w; x += 2) ctx.fillRect(this.px + x * q, this.py + y * q, q, q);
    }
    ctx.restore();
    ctx.imageSmoothingEnabled = this.zoom < 1;
    ctx.drawImage(this.img, this.px, this.py, w, hh);

    // contorno do pixel sob o ponteiro e do último pixel escolhido (só quando dá para ver)
    if (this.zoom >= 4) {
      const caixa = (p, cor, largura) => {
        if (!p) return;
        ctx.strokeStyle = cor;
        ctx.lineWidth = largura;
        ctx.strokeRect(this.px + p.x * this.zoom + 0.5, this.py + p.y * this.zoom + 0.5, this.zoom - 1, this.zoom - 1);
      };
      caixa(this.marca, '#ffb454', 2);
      caixa(this.hover, 'rgba(255,255,255,.9)', 1);
    }
  }

  /** Pixel da imagem sob um ponto da tela, ou null. */
  _pixelEm(clientX, clientY) {
    if (!this.img) return null;
    const r = this.canvas.getBoundingClientRect();
    const x = Math.floor((clientX - r.left - this.px) / this.zoom);
    const y = Math.floor((clientY - r.top - this.py) / this.zoom);
    return x >= 0 && y >= 0 && x < this.img.width && y < this.img.height ? { x, y } : null;
  }

  corEm(p) {
    const d = this.leitor.getImageData(p.x, p.y, 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  }

  _ligar() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (ev) => {
      if (!this.img) return;
      c.setPointerCapture(ev.pointerId);
      this._ponteiros.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, x0: ev.clientX, y0: ev.clientY });
      if (this._ponteiros.size === 2) this._gesto = this._medirGesto();
      else this._moveu = false;
    });
    c.addEventListener('pointermove', (ev) => {
      const p = this._ponteiros.get(ev.pointerId);
      if (!p) {
        if (ev.pointerType === 'mouse') this._passar(ev);
        return;
      }
      const dx = ev.clientX - p.x, dy = ev.clientY - p.y;
      p.x = ev.clientX; p.y = ev.clientY;
      if (this._ponteiros.size >= 2) {
        const g = this._medirGesto();
        if (this._gesto && g.dist > 0 && this._gesto.dist > 0) {
          const r = c.getBoundingClientRect();
          this.zoomPara(this.zoom * (g.dist / this._gesto.dist), g.cx - r.left, g.cy - r.top);
          this.px += g.cx - this._gesto.cx;
          this.py += g.cy - this._gesto.cy;
          this.desenhar();
        }
        this._gesto = g;
        this._moveu = true;
        return;
      }
      if (!this._moveu && Math.hypot(ev.clientX - p.x0, ev.clientY - p.y0) < 6) return; // ainda é um toque
      this._moveu = true;
      this.px += dx; this.py += dy;
      this._auto = false;
      c.classList.add('arrastando');
      this.desenhar();
    });
    const soltar = (ev) => {
      const p = this._ponteiros.get(ev.pointerId);
      if (!p) return;
      this._ponteiros.delete(ev.pointerId);
      c.classList.remove('arrastando');
      this._gesto = null;
      if (ev.type === 'pointerup' && !this._moveu && this._ponteiros.size === 0) this._pegar(ev);
      if (this._ponteiros.size === 0) this._moveu = false;
    };
    c.addEventListener('pointerup', soltar);
    c.addEventListener('pointercancel', soltar);
    c.addEventListener('pointerleave', () => { if (this.hover) { this.hover = null; this.aoPassar?.(null); this.desenhar(); } });
    c.addEventListener('wheel', (ev) => {
      if (!this.img) return;
      ev.preventDefault();
      const r = c.getBoundingClientRect();
      this.zoomPara(this.zoom * Math.pow(1.0018, -ev.deltaY), ev.clientX - r.left, ev.clientY - r.top);
    }, { passive: false });
  }

  _medirGesto() {
    const [a, b] = [...this._ponteiros.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }

  _passar(ev) {
    const p = this._pixelEm(ev.clientX, ev.clientY);
    const mudou = (p?.x !== this.hover?.x) || (p?.y !== this.hover?.y);
    this.hover = p;
    if (mudou) {
      this.aoPassar?.(p ? this.corEm(p) : null);
      this.desenhar();
    }
  }

  _pegar(ev) {
    const p = this._pixelEm(ev.clientX, ev.clientY);
    if (!p) return;
    this.marca = p;
    this.desenhar();
    this.aoPegar(this.corEm(p));
  }
}

/* ------------------------------------------------------------------ */
/* Painel                                                              */
/* ------------------------------------------------------------------ */

/**
 * @param ctl          Controlador (guarda a imagem em ctl.referencia)
 * @param aoPegarCor   (rgba) => void   chamado quando a pessoa toca num pixel da imagem
 * @returns { el, abrir, fechar, alternar, aberto, atualizar, destruir }
 */
export function criarPainelReferencia(ctl, { aoPegarCor, aoMudarAbertura }) {
  let aberto = false;
  let tamanho = 0;

  const entrada = h('input', { type: 'file', accept: 'image/*', hidden: true, 'aria-label': 'Escolher imagem de inspiração' });
  const amostra = h('i', { class: 'ref-amostra' });
  const hex = h('code', {}, '');
  const chip = h('span', { class: 'ref-cor', 'aria-live': 'off' }, amostra, hex);
  const palco = h('div', { class: 'ref-palco' });
  const vazio = h('div', { class: 'ref-vazio' },
    h('p', {}, 'Escolha uma imagem para servir de inspiração.'),
    h('button', { class: 'botao primario', type: 'button', onclick: () => entrada.click() }, icone('mais', 18), 'Adicionar imagem de inspiração'),
    h('p', { class: 'dica pequena' }, 'Ela fica guardada junto com este desenho e volta quando você abrir o projeto de novo. Não aparece nos PNG exportados.'));
  palco.append(vazio);

  const botao = (rotulo, nomeIcone, ao, extra = {}) => h('button', {
    class: 'botao pequeno icone', type: 'button', 'aria-label': rotulo, title: rotulo, onclick: ao, ...extra,
  }, nomeIcone.length > 2 ? icone(nomeIcone, 16) : nomeIcone);
  const bTrocar = botao('Trocar a imagem', 'imagem', () => entrada.click());
  const bRemover = botao('Remover a imagem do projeto', 'lixeira', () => remover());
  const bAjustar = botao('Ajustar à janela', '⤢', () => vista.ajustar());
  const bTamanho = botao('Mudar o tamanho do painel', '↔', () => {
    tamanho = (tamanho + 1) % TAMANHOS.length;
    el.style.setProperty('--ref-tam', String(TAMANHOS[tamanho]));
  });
  const bFechar = botao('Esconder o painel (a imagem continua no projeto)', '✕', () => fechar());

  const el = h('section', { class: 'painel-ref', hidden: true, 'aria-label': 'Imagem de inspiração' },
    h('header', { class: 'ref-topo' },
      h('strong', {}, 'Inspiração'), chip, h('span', { class: 'espaco' }),
      bTrocar, bRemover, bAjustar, bTamanho, bFechar),
    palco,
    h('p', { class: 'ref-dica' }, 'Toque ou clique na imagem para pegar uma cor. Arraste para mover; role ou use dois dedos para o zoom.'),
    entrada);
  el.style.setProperty('--ref-tam', String(TAMANHOS[tamanho]));

  const vista = new VistaImagem(palco, {
    aoPegar: (rgba) => {
      amostra.style.background = rgba[3] < 128 ? 'transparent' : rgbParaHex(rgba[0], rgba[1], rgba[2]);
      hex.textContent = rgba[3] < 128 ? 'transparente' : rgbParaHex(rgba[0], rgba[1], rgba[2]);
      aoPegarCor(rgba);
    },
    aoPassar: (rgba) => {
      if (!rgba) { amostra.style.background = 'transparent'; hex.textContent = ''; return; }
      amostra.style.background = rgba[3] < 128 ? 'transparent' : rgbParaHex(rgba[0], rgba[1], rgba[2]);
      hex.textContent = rgba[3] < 128 ? 'transparente' : rgbParaHex(rgba[0], rgba[1], rgba[2]);
    },
  });

  entrada.addEventListener('change', async () => {
    const arquivo = entrada.files?.[0];
    entrada.value = ''; // permite escolher o mesmo arquivo de novo
    if (!arquivo) return;
    try {
      const ref = await prepararImagem(arquivo);
      ctl.definirReferencia(ref);
      aviso('Imagem de inspiração adicionada. Ela será salva junto com o desenho.', { tipo: 'ok' });
    } catch (erro) {
      avisarErro(erro);
    }
  });

  async function remover() {
    const certo = await confirmar({
      titulo: 'Remover a imagem de inspiração?',
      mensagem: 'Ela deixa de fazer parte deste desenho quando você salvar. Seu desenho em si não muda.',
      rotuloConfirmar: 'Remover',
      perigo: true,
    });
    if (certo) ctl.definirReferencia(null);
  }

  let marcaCarregada = null;
  async function atualizar() {
    const ref = ctl.referencia;
    vazio.hidden = !!ref;
    bTrocar.hidden = bRemover.hidden = bAjustar.hidden = chip.hidden = !ref;
    if (ref?.dados !== marcaCarregada) {
      marcaCarregada = ref?.dados ?? null;
      try { await vista.definir(marcaCarregada); } catch { avisarErro(new ErroDoEditor('Não consegui mostrar a imagem de inspiração.')); }
    }
  }

  function abrir() { aberto = true; el.hidden = false; aoMudarAbertura?.(true); vista._redimensionar(); }
  function fechar() { aberto = false; el.hidden = true; aoMudarAbertura?.(false); }

  ctl.on('referencia', () => { atualizar(); if (ctl.referencia) abrir(); });
  atualizar();

  return {
    el,
    atualizar,
    abrir,
    fechar,
    alternar: () => (aberto ? fechar() : abrir()),
    get aberto() { return aberto; },
    destruir: () => vista.destruir(),
  };
}
