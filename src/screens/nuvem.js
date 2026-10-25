/**
 * nuvem.js (tela) — Conta e sincronização com o Supabase.
 *
 * Rota: #/nuvem
 *
 * Com a conta ligada, o que é feito em um aparelho aparece no outro (PC e celular).
 * Os dados continuam também neste navegador: dá para usar sem internet, e o que mudar
 * sobe quando a conexão voltar.
 */

import { h, preencher } from '../ui/dom.js';
import { aviso, avisarErro } from '../ui/toast.js';
import { confirmar } from '../ui/dialogos.js';
import { formatarDataHora, pluralizar } from '../ui/formato.js';
import {
  estadoDaSincronia, sincronizarAgora, entrar, criarConta, sair, limparConflitos,
} from '../core/sincronia.js';
import { sessaoAtual } from '../core/nuvem.js';

const esperarPintar = () => new Promise((r) => setTimeout(r, 30));

/** Texto curto da situação (também usado no rodapé da tela inicial). */
export function textoDaSituacao(e) {
  if (e.fase === 'desligada') return 'Nuvem desligada';
  if (e.fase === 'sincronizando') return 'Sincronizando…';
  if (e.fase === 'sem_rede') return e.pendentes ? `Sem internet · ${pluralizar(e.pendentes, 'alteração esperando', 'alterações esperando')}` : 'Sem internet';
  if (e.fase === 'erro') return 'Erro ao sincronizar';
  if (e.pendentes) return pluralizar(e.pendentes, 'alteração esperando', 'alterações esperando');
  return e.ultimaEm ? `Sincronizado · ${formatarDataHora(e.ultimaEm)}` : 'Conectado';
}

export async function montar(el, { voltar, navegar }) {
  document.title = 'Nuvem · Mini Engine';
  const corpo = h('div', { class: 'nuvem-corpo' });

  el.append(
    h('header', { class: 'topo' },
      h('button', { class: 'botao', type: 'button', 'aria-label': 'Voltar', onclick: () => voltar('/') }, '←'),
      h('h1', {}, 'Nuvem')),
    h('p', { class: 'dica' }, 'Com a nuvem ligada, o que você faz neste aparelho aparece no outro (PC e celular), e vice-versa. Use a mesma conta nos dois.'),
    corpo,
    h('section', { class: 'painel backup-notas' },
      h('h2', {}, 'Bom saber'),
      h('ul', { class: 'lista-simples' },
        h('li', {}, 'Tudo continua guardado também neste navegador: sem internet o app funciona normal, e as alterações sobem quando a conexão voltar.'),
        h('li', {}, 'Se o mesmo desenho for alterado nos dois aparelhos antes de sincronizar, nada se perde: a versão da nuvem fica no lugar e a deste aparelho aparece ao lado como “nome (conflito)”.'),
        h('li', {}, 'As chaves de API das IAs e o rascunho do editor nunca vão para a nuvem.'),
        h('li', {}, 'No plano grátis, o Supabase pausa o projeto depois de cerca de 7 dias sem nenhum uso. Se a sincronização parar de funcionar, entre no painel do Supabase e reative o projeto.'),
        h('li', {}, 'O backup em ZIP continua valendo como cópia de segurança extra.'))));

  /* ---------- sem conta ---------- */
  function desenharEntrada(erroTexto = null) {
    const email = h('input', {
      class: 'campo', id: 'nuvem-email', type: 'email', autocomplete: 'username', inputMode: 'email',
      placeholder: 'seu@email.com', spellcheck: false,
    });
    const senha = h('input', {
      class: 'campo', id: 'nuvem-senha', type: 'password', autocomplete: 'current-password', placeholder: 'mínimo 6 caracteres',
    });
    const erro = h('p', { class: 'campo-erro', role: 'alert', hidden: !erroTexto }, erroTexto || '');
    const bEntrar = h('button', { class: 'botao primario', type: 'submit' }, 'Entrar');
    const bCriar = h('button', { class: 'botao', type: 'button', onclick: () => agir('criar') }, 'Criar conta');

    async function agir(qual) {
      erro.hidden = true;
      bEntrar.disabled = bCriar.disabled = true;
      const rotulo = qual === 'criar' ? bCriar : bEntrar;
      const original = rotulo.textContent;
      rotulo.textContent = qual === 'criar' ? 'Criando…' : 'Entrando…';
      await esperarPintar();
      try {
        const fn = qual === 'criar' ? criarConta : entrar;
        await fn(email.value, senha.value);
        const e = estadoDaSincronia();
        if (e.fase === 'erro' || e.fase === 'sem_rede') aviso(`Entrou, mas a primeira sincronização falhou: ${e.erro}`, { tipo: 'erro', duracao: 8000 });
        else aviso(qual === 'criar' ? 'Conta criada e sincronizada.' : 'Pronto: este aparelho está sincronizado.', { tipo: 'ok' });
        desenhar();
      } catch (x) {
        erro.textContent = x.message || String(x);
        erro.hidden = false;
        bEntrar.disabled = bCriar.disabled = false;
        rotulo.textContent = original;
      }
    }

    preencher(corpo, h('form', {
      class: 'painel nuvem-form',
      onsubmit: (ev) => { ev.preventDefault(); agir('entrar'); },
    },
    h('h2', { class: 'nuvem-titulo' }, 'Entrar na sua conta'),
    h('label', { class: 'campo-rotulo', htmlFor: 'nuvem-email' }, 'E-mail'), email,
    h('label', { class: 'campo-rotulo', htmlFor: 'nuvem-senha' }, 'Senha'), senha,
    erro,
    h('div', { class: 'nuvem-botoes' }, bEntrar, bCriar),
    h('p', { class: 'dica pequena' }, 'Primeira vez? Digite um e-mail e uma senha e toque em “Criar conta”. No outro aparelho, use “Entrar” com os mesmos dados.'),
    h('div', { class: 'aviso-caixa', role: 'note' },
      'Ao entrar, o que já está neste aparelho é enviado para a nuvem e se junta ao que já está lá. Nada é apagado.')));
  }

  /* ---------- com conta ---------- */
  function desenharConta(e) {
    const bSinc = h('button', {
      class: 'botao primario largo', type: 'button', disabled: e.fase === 'sincronizando',
      onclick: async () => {
        bSinc.disabled = true;
        bSinc.textContent = 'Sincronizando…';
        const r = await sincronizarAgora().catch(() => null);
        const depois = estadoDaSincronia();
        if (r) {
          const partes = [];
          if (r.aplicados) partes.push(`${pluralizar(r.aplicados, 'item chegou', 'itens chegaram')}`);
          if (r.apagados) partes.push(`${pluralizar(r.apagados, 'item apagado', 'itens apagados')}`);
          if (r.enviados) partes.push(`${pluralizar(r.enviados, 'alteração enviada', 'alterações enviadas')}`);
          aviso(partes.length ? `Sincronizado: ${partes.join(', ')}.` : 'Tudo já estava sincronizado.', { tipo: 'ok' });
        } else if (depois.erro) aviso(depois.erro, { tipo: 'erro', duracao: 7000 });
        desenhar();
      },
    }, e.fase === 'sincronizando' ? 'Sincronizando…' : '🔄 Sincronizar agora');

    const bSair = h('button', {
      class: 'botao largo', type: 'button',
      onclick: async () => {
        const pend = estadoDaSincronia().pendentes;
        const certo = await confirmar({
          titulo: 'Sair da conta neste aparelho?',
          mensagem: `Os desenhos continuam neste aparelho, mas deixam de sincronizar.${pend ? ` Atenção: ${pluralizar(pend, 'alteração ainda não foi enviada', 'alterações ainda não foram enviadas')}.` : ''}`,
          rotuloConfirmar: 'Sair',
          perigo: pend > 0,
        });
        if (!certo) return;
        try {
          await sair();
          aviso('Você saiu da conta neste aparelho.');
          desenhar();
        } catch (x) { avisarErro(x); }
      },
    }, 'Sair desta conta neste aparelho');

    const classe = e.fase === 'erro' ? 'erro' : e.fase === 'sem_rede' ? 'atencao' : '';
    preencher(corpo, [
      h('section', { class: 'painel backup-situacao', 'aria-live': 'polite' },
        h('p', { class: 'backup-linha' }, h('strong', {}, 'Conta: '), e.email || '—'),
        h('p', { class: 'backup-linha nuvem-situacao' }, h('strong', {}, 'Situação: '), textoDaSituacao(e)),
        e.ultimaEm && e.fase !== 'ociosa' && h('p', { class: 'backup-linha' }, h('strong', {}, 'Última vez: '), formatarDataHora(e.ultimaEm)),
        e.erro && h('div', { class: `aviso-caixa ${classe}`, role: 'alert' }, e.erro)),
      e.conflitos.length > 0 && h('div', { class: 'aviso-caixa atencao', role: 'note' },
        h('strong', {}, 'Alterado nos dois aparelhos: '),
        `${e.conflitos.join(', ')}. A sua versão ficou ao lado, com “(conflito)” no nome. Confira e apague a que não quiser.`,
        ' ',
        h('button', { class: 'link', type: 'button', onclick: () => { limparConflitos(); } }, 'Entendi'),
        ' · ',
        h('button', { class: 'link', type: 'button', onclick: () => navegar('/gerenciador') }, 'Abrir o Gerenciador')),
      h('div', { class: 'backup-acoes' }, bSinc, bSair),
    ]);
  }

  function desenhar() {
    const e = estadoDaSincronia();
    if (!sessaoAtual()) desenharEntrada(e.fase === 'erro' ? e.erro : null);
    else desenharConta(e);
  }

  const aoMudar = () => {
    // não atrapalha quem está digitando no formulário de entrada
    if (corpo.querySelector('form') && !sessaoAtual()) return;
    desenhar();
  };
  globalThis.addEventListener('miniengine:nuvem', aoMudar);
  desenhar();
  return () => globalThis.removeEventListener('miniengine:nuvem', aoMudar);
}
