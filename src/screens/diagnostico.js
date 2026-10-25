/**
 * diagnostico.js — Mostra se tudo está funcionando e oferece ferramentas de teste.
 *
 *  - confirma que o Phaser 3 local (vendor/phaser.min.js) carregou
 *  - confirma que o IndexedDB funciona e quantos itens existem
 *  - estado do armazenamento persistente
 *  - roda uma mini cena do Phaser para provar que ele desenha
 *  - cria uma pasta de exemplos (para testar o gerenciador sem editor)
 *
 * Rota: #/diagnostico
 */

import { h } from '../ui/dom.js';
import { aviso, avisarErro } from '../ui/toast.js';
import { formatarBytes, pluralizar } from '../ui/formato.js';
import { RAIZ } from '../core/tipos.js';
import { spriteVazio, cenarioVazio } from '../core/modelos.js';
import * as armazem from '../core/storage.js';

const linha = (estado, rotulo, texto) => h('div', { class: `diag-linha ${estado}` },
  h('span', { class: 'diag-marca', 'aria-hidden': 'true' }, { ok: '✔', erro: '✖', info: '•', aviso: '!' }[estado]),
  h('span', { class: 'diag-rotulo' }, rotulo),
  h('span', { class: 'diag-texto' }, texto));

export async function montar(el, { navegar, voltar }) {
  document.title = 'Diagnóstico · Mini Engine';
  let jogoDeTeste = null;

  const quadro = h('div', { class: 'painel diag' });
  const palco = h('div', { class: 'palco-phaser', hidden: true });

  el.append(
    h('header', { class: 'topo' },
      h('button', { class: 'botao', type: 'button', 'aria-label': 'Voltar', onclick: () => voltar('/') }, '←'),
      h('h1', {}, 'Diagnóstico')),
    quadro,
    h('div', { class: 'barra-acoes quebra' },
      h('button', { class: 'botao', type: 'button', onclick: () => alternarPhaser() }, '▶ Testar Phaser'),
      h('button', { class: 'botao', type: 'button', onclick: () => pedirPersistencia() }, '🔒 Pedir armazenamento persistente'),
      h('button', { class: 'botao', type: 'button', onclick: () => criarExemplos() }, '🧪 Criar exemplos de teste')),
    palco);

  /* ---------- Estado ---------- */
  async function atualizar() {
    const linhas = [];

    if (typeof Phaser !== 'undefined') {
      linhas.push(linha('ok', 'Phaser', `versão ${Phaser.VERSION} carregada de vendor/phaser.min.js`));
    } else {
      linhas.push(linha('erro', 'Phaser', 'não carregou — confira se a pasta vendor/ foi enviada ao GitHub.'));
    }

    try {
      const est = await armazem.estatisticas();
      linhas.push(linha('ok', 'IndexedDB', 'funcionando'));
      linhas.push(linha('info', 'Itens salvos', [
        pluralizar(est.pasta, 'pasta', 'pastas'),
        pluralizar(est.sprite, 'sprite', 'sprites'),
        pluralizar(est.cenario, 'cenário', 'cenários'),
        pluralizar(est.jogo, 'jogo', 'jogos'),
        `${est.lixeira} na lixeira`,
      ].join(' · ')));
    } catch (erro) {
      linhas.push(linha('erro', 'IndexedDB', erro.message));
    }

    const st = await armazem.statusArmazenamento();
    if (!st.suportado) {
      linhas.push(linha('aviso', 'Persistência', 'este navegador não informa. Faça backups (tela Backup).'));
    } else if (st.persistente) {
      linhas.push(linha('ok', 'Persistência', 'ativa — o navegador não apaga seus dados sozinho.'));
    } else {
      linhas.push(linha('aviso', 'Persistência', 'não ativa — o navegador pode apagar os dados se faltar espaço. Use o botão abaixo e faça backups (tela Backup).'));
    }
    if (st.usado !== null) {
      linhas.push(linha('info', 'Espaço usado', `${formatarBytes(st.usado)} de ${formatarBytes(st.cota)} disponíveis`));
    }
    linhas.push(linha('info', 'Navegador', navigator.userAgent));
    quadro.replaceChildren(...linhas);
  }

  /* ---------- Phaser ---------- */
  function alternarPhaser() {
    if (typeof Phaser === 'undefined') {
      aviso('O Phaser não carregou, então não dá para testar.', { tipo: 'erro' });
      return;
    }
    if (jogoDeTeste) {
      jogoDeTeste.destroy(true);
      jogoDeTeste = null;
      palco.hidden = true;
      return;
    }
    palco.hidden = false;
    jogoDeTeste = new Phaser.Game({
      type: Phaser.CANVAS, // CANVAS para funcionar até em aparelhos sem WebGL
      width: 320,
      height: 160,
      parent: palco,
      backgroundColor: '#1b1e30',
      pixelArt: true,
      banner: false,
      scene: {
        create() {
          const quadrado = this.add.rectangle(40, 100, 32, 32, 0xffb454);
          this.tweens.add({
            targets: quadrado, x: 280, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.inOut',
          });
          this.add.text(160, 28, `Phaser ${Phaser.VERSION} OK`, {
            fontFamily: 'monospace', fontSize: '16px', color: '#eceef8',
          }).setOrigin(0.5);
        },
      },
    });
  }

  /* ---------- Persistência ---------- */
  async function pedirPersistencia() {
    const r = await armazem.pedirPersistencia();
    if (!r.suportado) aviso('Este navegador não suporta armazenamento persistente.');
    else if (r.persistente) aviso('Armazenamento persistente ativado.', { tipo: 'ok' });
    else aviso('O navegador não concedeu (comum em sites pouco usados). Faça backups.', { tipo: 'erro', duracao: 6000 });
    await atualizar();
  }

  /* ---------- Exemplos ---------- */
  async function criarExemplos() {
    try {
      const nome = await armazem.nomeDisponivel(RAIZ, 'Exemplo');
      const exemplo = await armazem.criarPasta(nome, RAIZ);
      const personagens = await armazem.criarPasta('Personagens', exemplo.id);
      const inimigos = await armazem.criarPasta('Inimigos', personagens.id);
      const cenarios = await armazem.criarPasta('Cenários', exemplo.id);

      await armazem.criarItem({
        tipo: 'sprite', nome: 'Guerreiro', paiId: personagens.id,
        dados: spriteVazio('Guerreiro'), resumo: { descricao: '1 camada · 1 quadro' },
      });
      await armazem.criarItem({
        tipo: 'sprite', nome: 'Slime', paiId: inimigos.id,
        dados: spriteVazio('Slime', 16), resumo: { descricao: '1 camada · 1 quadro' },
      });
      await armazem.criarItem({
        tipo: 'cenario', nome: 'Floresta', paiId: cenarios.id,
        dados: cenarioVazio('Floresta'), resumo: { descricao: '3 camadas de profundidade' },
      });

      aviso(`Pasta “${nome}” criada com exemplos.`, {
        tipo: 'ok',
        acao: { rotulo: 'Ver', ao: () => navegar(`/gerenciador/${exemplo.id}`) },
      });
      await atualizar();
    } catch (erro) {
      avisarErro(erro);
    }
  }

  await atualizar();

  // Ao sair da tela, destrói o jogo de teste para não deixar o Phaser rodando.
  return () => {
    if (jogoDeTeste) {
      jogoDeTeste.destroy(true);
      jogoDeTeste = null;
    }
  };
}
