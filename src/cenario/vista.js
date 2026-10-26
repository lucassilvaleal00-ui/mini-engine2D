/**
 * vista.js — A "tela gigante" do construtor de cenário: desenha a grade e os objetos
 * (fundo → meio → frente), com zoom, mover a vista, selecionar, arrastar e colocar.
 *
 * Toque/mouse:
 *   - tocar num objeto seleciona; segurar e arrastar move (encaixando na grade se ligado);
 *   - arrastar no vazio move a vista; dois dedos = pinça (zoom) e mover;
 *   - roda do mouse = zoom; botão do meio ou Espaço + arrastar = mover a vista;
 *   - no modo "colocar", tocar põe uma cópia do frame escolhido na célula.
 */

import { frameDoSprite } from './render.js';
import { larguraPx, alturaPx, ordemDeDesenho, encaixar } from './modelo.js';

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 32;
const LIMIAR_ARRASTO = 4; // px de tela antes de considerar arrasto

export class VistaCenario {
  /**
   * @param palco  elemento que recebe o canvas
   * @param op     { cenario(): dados, selecionado(): id|null, pincel(): {spriteId, quadro}|null,
   *                 encaixe(): bool, niveisVisiveis(): Set,
   *                 aoSelecionar(id|null), aoComecarArrasto(id), aoArrastar(id, x, y), aoSoltar(id, moveu),
   *                 aoColocar(x, y) }
   */
  constructor(palco, op) {
    this.palco = palco;
    this.op = op;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'cen-canvas';
    this.canvas.setAttribute('aria-label', 'Cenário: toque para selecionar, arraste para mover');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.vista = this; // acesso para depuração e testes automáticos
    palco.append(this.canvas);
    this.zoom = 1; this.px = 0; this.py = 0;
    this.imagens = new Map(); // `${spriteId}:${quadro}` -> canvas | 'carregando' | null
    this.hover = null;        // posição do mundo sob o ponteiro (modo colocar)
    this.espaco = false;
    this._ptr = new Map();
    this._acao = null;
    this._agendado = 0;
    this._ligar();
    this._obs = new ResizeObserver(() => this._redimensionar());
    this._obs.observe(palco);
  }

  destruir() { this._obs.disconnect(); cancelAnimationFrame(this._agendado); this.canvas.remove(); }

  /* ---------- imagens ---------- */
  esquecerImagens() { this.imagens.clear(); this.desenhar(); }
  imagem(spriteId, quadro) {
    const k = `${spriteId}:${quadro}`;
    const atual = this.imagens.get(k);
    if (atual !== undefined) return atual === 'carregando' ? null : atual;
    this.imagens.set(k, 'carregando');
    frameDoSprite(spriteId, quadro).then((f) => {
      if (!f) { this.imagens.set(k, null); this.desenhar(); return; }
      const c = document.createElement('canvas');
      c.width = f.largura; c.height = f.altura;
      c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(f.rgba), f.largura, f.altura), 0, 0);
      this.imagens.set(k, c);
      this.desenhar();
    }).catch(() => { this.imagens.set(k, null); this.desenhar(); });
    return null;
  }
  /** Tamanho do objeto em pixels do mundo (grade, se a imagem ainda não carregou ou sumiu). */
  tamanho(o) {
    const img = this.imagens.get(`${o.spriteId}:${o.quadro}`);
    const g = this.op.cenario().grade;
    return img && img !== 'carregando' ? [img.width, img.height] : [g, g];
  }

  /* ---------- geometria ---------- */
  _redimensionar() {
    const r = this.palco.getBoundingClientRect();
    this.cw = Math.max(1, Math.floor(r.width));
    this.ch = Math.max(1, Math.floor(r.height));
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.cw * this.dpr);
    this.canvas.height = Math.round(this.ch * this.dpr);
    this.canvas.style.width = `${this.cw}px`;
    this.canvas.style.height = `${this.ch}px`;
    // só enquadra quando o palco já tem tamanho de verdade (senão o zoom sai minúsculo e fica assim)
    if (!this._ajustado && this.cw > 40 && this.ch > 40) { this.ajustar(); this._ajustado = true; } else this.desenhar();
  }

  /** Cabe o cenário inteiro na tela. */
  ajustar() {
    const c = this.op.cenario();
    const W = larguraPx(c), H = alturaPx(c);
    const z = Math.min((this.cw - 24) / W, (this.ch - 24) / H);
    this.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z >= 1 ? Math.floor(z) : z));
    this.px = Math.round((this.cw - W * this.zoom) / 2);
    this.py = Math.round((this.ch - H * this.zoom) / 2);
    this.desenhar();
  }

  zoomEm(fator, sx = this.cw / 2, sy = this.ch / 2) {
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.zoom * fator));
    const wx = (sx - this.px) / this.zoom, wy = (sy - this.py) / this.zoom;
    this.zoom = z;
    this.px = sx - wx * z;
    this.py = sy - wy * z;
    this.desenhar();
  }
  zoomMais() { this.zoomEm(this.zoom < 1 ? 1.5 : 2); }
  zoomMenos() { this.zoomEm(this.zoom <= 1 ? 1 / 1.5 : 0.5); }

  paraMundo(ev) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (ev.clientX - r.left - this.px) / this.zoom, y: (ev.clientY - r.top - this.py) / this.zoom, sx: ev.clientX - r.left, sy: ev.clientY - r.top };
  }

  /** Objetos sob o ponto, do mais de cima para o de baixo (só níveis visíveis). */
  todosSob(x, y) {
    const vis = this.op.niveisVisiveis();
    const lista = ordemDeDesenho(this.op.cenario()).filter((o) => vis.has(o.nivel));
    const saida = [];
    for (let i = lista.length - 1; i >= 0; i--) {
      const o = lista[i];
      const [w, h] = this.tamanho(o);
      if (x >= o.x && x < o.x + w && y >= o.y && y < o.y + h) saida.push(o);
    }
    return saida;
  }

  /** Objeto mais de cima sob o ponto. */
  acertar(x, y) { return this.todosSob(x, y)[0] || null; }

  /* ---------- desenho ---------- */
  desenhar() {
    if (this._agendado) return;
    this._agendado = requestAnimationFrame(() => { this._agendado = 0; this._pintar(); });
  }

  _pintar() {
    const ctx = this.ctx;
    const c = this.op.cenario();
    const W = larguraPx(c), H = alturaPx(c);
    const z = this.zoom;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#0c0d14';
    ctx.fillRect(0, 0, this.cw, this.ch);
    ctx.save();
    ctx.translate(this.px, this.py);
    ctx.imageSmoothingEnabled = false;

    // fundo
    if (c.fundo) { ctx.fillStyle = c.fundo; ctx.fillRect(0, 0, W * z, H * z); } else {
      const t = 8;
      for (let y = 0; y < H * z; y += t) for (let x = 0; x < W * z; x += t) {
        ctx.fillStyle = ((x / t + y / t) & 1) ? '#232636' : '#2c3042';
        ctx.fillRect(x, y, Math.min(t, W * z - x), Math.min(t, H * z - y));
      }
    }

    // objetos (fundo → frente)
    const vis = this.op.niveisVisiveis();
    const sel = this.op.selecionado();
    for (const o of ordemDeDesenho(c)) {
      if (!vis.has(o.nivel)) continue;
      const img = this.imagem(o.spriteId, o.quadro);
      const [w, h] = this.tamanho(o);
      if (img) {
        if (o.espelhar) {
          ctx.save();
          ctx.translate((o.x + w) * z, o.y * z);
          ctx.scale(-1, 1);
          ctx.drawImage(img, 0, 0, w * z, h * z);
          ctx.restore();
        } else ctx.drawImage(img, o.x * z, o.y * z, w * z, h * z);
      } else if (this.imagens.get(`${o.spriteId}:${o.quadro}`) === null) {
        // sprite apagado: um X vermelho no lugar
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 2;
        ctx.strokeRect(o.x * z + 1, o.y * z + 1, w * z - 2, h * z - 2);
        ctx.beginPath(); ctx.moveTo(o.x * z, o.y * z); ctx.lineTo((o.x + w) * z, (o.y + h) * z);
        ctx.moveTo((o.x + w) * z, o.y * z); ctx.lineTo(o.x * z, (o.y + h) * z); ctx.stroke();
      }
      if (o.solido && this.op.mostrarSolidos?.()) {
        ctx.fillStyle = 'rgba(255, 107, 107, .18)';
        ctx.fillRect(o.x * z, o.y * z, w * z, h * z);
      }
    }

    // grade
    const passo = c.grade * z;
    if (passo >= 6) {
      ctx.strokeStyle = 'rgba(255, 255, 255, .09)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= c.colunas; x++) { const X = Math.round(x * passo) + 0.5; ctx.moveTo(X, 0); ctx.lineTo(X, H * z); }
      for (let y = 0; y <= c.linhas; y++) { const Y = Math.round(y * passo) + 0.5; ctx.moveTo(0, Y); ctx.lineTo(W * z, Y); }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, .35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-0.5, -0.5, W * z + 1, H * z + 1);

    // seleção
    const o = sel && c.objetos.find((x) => x.id === sel);
    if (o) {
      const [w, h] = this.tamanho(o);
      ctx.strokeStyle = '#ffb454';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(o.x * z - 1, o.y * z - 1, w * z + 2, h * z + 2);
      ctx.setLineDash([]);
    }

    // fantasma do "colocar"
    const p = this.op.pincel();
    if (p && this.hover) {
      const img = this.imagem(p.spriteId, p.quadro);
      if (img) {
        const x = this.op.encaixe() ? encaixar(this.hover.x - img.width / 2, c.grade) : Math.round(this.hover.x - img.width / 2);
        const y = this.op.encaixe() ? encaixar(this.hover.y - img.height / 2, c.grade) : Math.round(this.hover.y - img.height / 2);
        ctx.globalAlpha = 0.55;
        ctx.drawImage(img, x * z, y * z, img.width * z, img.height * z);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#4fd8c4';
        ctx.strokeRect(x * z, y * z, img.width * z, img.height * z);
      }
    }
    ctx.restore();
  }

  /** Posição (canto de cima à esquerda) onde o pincel colocaria, a partir de um ponto do mundo. */
  posicaoDoPincel(pt) {
    const p = this.op.pincel();
    const img = p && this.imagem(p.spriteId, p.quadro);
    const w = img ? img.width : this.op.cenario().grade;
    const h = img ? img.height : this.op.cenario().grade;
    const g = this.op.cenario().grade;
    return this.op.encaixe()
      ? { x: encaixar(pt.x - w / 2, g), y: encaixar(pt.y - h / 2, g) }
      : { x: Math.round(pt.x - w / 2), y: Math.round(pt.y - h / 2) };
  }

  /* ---------- ponteiro ---------- */
  _ligar() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const pt = this.paraMundo(e);
      this.zoomEm(e.deltaY < 0 ? 1.25 : 0.8, pt.sx, pt.sy);
    }, { passive: false });

    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      const pt = this.paraMundo(e);
      this._ptr.set(e.pointerId, { sx: pt.sx, sy: pt.sy });
      if (this._ptr.size === 2) {
        // dois dedos: cancela o que estava fazendo e vira pinça
        if (this._acao?.tipo === 'arrastar' && this._acao.moveu) this.op.aoSoltar(this._acao.id, true);
        this._acao = { tipo: 'pinca', ...this._medir() };
        return;
      }
      if (this._ptr.size > 2) return;
      if (e.button === 1 || e.button === 2 || this.espaco || this.op.modoMao?.()) {
        this._acao = { tipo: 'mover-vista', sx: pt.sx, sy: pt.sy, px: this.px, py: this.py };
        c.classList.add('arrastando');
        return;
      }
      if (this.op.pincel()) { this._acao = { tipo: 'colocar', sx: pt.sx, sy: pt.sy, px: this.px, py: this.py, moveu: false }; return; }
      // Seleção: o de cima é escolhido; se o já selecionado estiver sob o dedo, ele continua
      // (para poder arrastar o de baixo). Tocar de novo sem arrastar passa para o objeto de baixo.
      const sob = this.todosSob(pt.x, pt.y);
      const atual = sob.find((x) => x.id === this.op.selecionado());
      const o = atual || sob[0];
      if (o) {
        this.op.aoSelecionar(o.id);
        this._acao = { tipo: 'arrastar', id: o.id, dx: pt.x - o.x, dy: pt.y - o.y, sx: pt.sx, sy: pt.sy, moveu: false, ciclo: !!atual && sob.length > 1, sob };
      } else {
        this._acao = { tipo: 'vazio', sx: pt.sx, sy: pt.sy, px: this.px, py: this.py, moveu: false };
      }
    });

    c.addEventListener('pointermove', (e) => {
      const pt = this.paraMundo(e);
      if (this.op.pincel()) { this.hover = pt; this.desenhar(); }
      const p = this._ptr.get(e.pointerId);
      if (!p) return;
      p.sx = pt.sx; p.sy = pt.sy;
      const a = this._acao;
      if (!a) return;
      if (a.tipo === 'pinca') {
        const m = this._medir();
        const fator = m.dist / a.dist;
        const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.zoom * fator));
        const wx = (a.cx - this.px) / this.zoom, wy = (a.cy - this.py) / this.zoom;
        this.zoom = z;
        this.px = m.cx - wx * z;
        this.py = m.cy - wy * z;
        Object.assign(a, m);
        this.desenhar();
        return;
      }
      const longe = Math.hypot(pt.sx - a.sx, pt.sy - a.sy) > LIMIAR_ARRASTO;
      if (a.tipo === 'mover-vista' || ((a.tipo === 'vazio' || a.tipo === 'colocar') && (a.moveu || longe))) {
        a.moveu = true;
        this.px = a.px + (pt.sx - a.sx);
        this.py = a.py + (pt.sy - a.sy);
        c.classList.add('arrastando');
        this.desenhar();
      } else if (a.tipo === 'arrastar' && (a.moveu || longe)) {
        if (!a.moveu) { a.moveu = true; this.op.aoComecarArrasto(a.id); }
        const g = this.op.cenario().grade;
        const x = this.op.encaixe() ? encaixar(pt.x - a.dx, g) : Math.round(pt.x - a.dx);
        const y = this.op.encaixe() ? encaixar(pt.y - a.dy, g) : Math.round(pt.y - a.dy);
        this.op.aoArrastar(a.id, x, y);
        this.desenhar();
      }
    });

    const fim = (e, cancelado) => {
      this._ptr.delete(e.pointerId);
      const a = this._acao;
      if (this._ptr.size > 0) { if (a?.tipo === 'pinca' && this._ptr.size === 1) this._acao = null; return; }
      this._acao = null;
      c.classList.remove('arrastando');
      if (!a || cancelado) return;
      if (a.tipo === 'arrastar') {
        this.op.aoSoltar(a.id, a.moveu);
        if (!a.moveu && a.ciclo) {
          const i = a.sob.findIndex((x) => x.id === a.id);
          this.op.aoSelecionar(a.sob[(i + 1) % a.sob.length].id);
        }
      }
      else if (a.tipo === 'vazio' && !a.moveu) this.op.aoSelecionar(null);
      else if (a.tipo === 'colocar' && !a.moveu) {
        const pos = this.posicaoDoPincel(this.paraMundo(e));
        this.op.aoColocar(pos.x, pos.y);
      }
    };
    c.addEventListener('pointerup', (e) => fim(e, false));
    c.addEventListener('pointercancel', (e) => fim(e, true));
    c.addEventListener('pointerleave', () => { if (this.hover) { this.hover = null; this.desenhar(); } });
  }

  _medir() {
    const [a, b] = [...this._ptr.values()];
    return { dist: Math.max(1, Math.hypot(a.sx - b.sx, a.sy - b.sy)), cx: (a.sx + b.sx) / 2, cy: (a.sy + b.sy) / 2 };
  }
}
