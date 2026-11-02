/**
 * form-entrada.js — Formulário de e-mail e senha (Entrar / Criar conta) usado pela tela de login
 * (#/entrar) e pela tela Nuvem.
 */

import { h } from './dom.js';
import { entrar, criarConta, estadoDaSincronia } from '../core/sincronia.js';

const esperarPintar = () => new Promise((r) => setTimeout(r, 30));

/**
 * @param aoEntrar   ({ criou, estado }) => void  — chamado depois de entrar e da primeira sincronização
 * @param erroInicial texto de erro para mostrar logo de cara (ex.: sessão expirada)
 */
export function formularioDeEntrada({ aoEntrar, erroInicial = null, titulo = 'Entrar na sua conta' } = {}) {
  const email = h('input', {
    class: 'campo', id: 'nuvem-email', type: 'email', autocomplete: 'username', inputMode: 'email',
    placeholder: 'seu@email.com', spellcheck: false,
  });
  const senha = h('input', {
    class: 'campo', id: 'nuvem-senha', type: 'password', autocomplete: 'current-password', placeholder: 'mínimo 6 caracteres',
  });
  const mostrar = h('button', {
    class: 'link pequeno', type: 'button', 'aria-pressed': 'false',
    onclick: () => {
      const ver = senha.type === 'password';
      senha.type = ver ? 'text' : 'password';
      mostrar.textContent = ver ? 'esconder senha' : 'mostrar senha';
      mostrar.setAttribute('aria-pressed', String(ver));
    },
  }, 'mostrar senha');
  const erro = h('p', { class: 'campo-erro', role: 'alert', hidden: !erroInicial }, erroInicial || '');
  const situacao = h('p', { class: 'dica pequena', role: 'status', hidden: true });
  const bEntrar = h('button', { class: 'botao primario', type: 'submit' }, 'Entrar');
  const bCriar = h('button', { class: 'botao', type: 'button', onclick: () => agir('criar') }, 'Criar conta');

  async function agir(qual) {
    erro.hidden = true;
    bEntrar.disabled = bCriar.disabled = true;
    const rotulo = qual === 'criar' ? bCriar : bEntrar;
    const original = rotulo.textContent;
    rotulo.textContent = qual === 'criar' ? 'Criando…' : 'Entrando…';
    situacao.hidden = false;
    situacao.textContent = 'Conectando e sincronizando… (na primeira vez pode demorar um pouco)';
    await esperarPintar();
    try {
      await (qual === 'criar' ? criarConta : entrar)(email.value, senha.value);
      situacao.hidden = true;
      aoEntrar?.({ criou: qual === 'criar', estado: estadoDaSincronia() });
    } catch (x) {
      situacao.hidden = true;
      erro.textContent = x.message || String(x);
      erro.hidden = false;
      bEntrar.disabled = bCriar.disabled = false;
      rotulo.textContent = original;
    }
  }

  return h('form', {
    class: 'painel nuvem-form',
    onsubmit: (ev) => { ev.preventDefault(); agir('entrar'); },
  },
  h('h2', { class: 'nuvem-titulo' }, titulo),
  h('label', { class: 'campo-rotulo', htmlFor: 'nuvem-email' }, 'E-mail'), email,
  h('label', { class: 'campo-rotulo', htmlFor: 'nuvem-senha' }, 'Senha'), senha,
  h('div', { class: 'linha-direita' }, mostrar),
  erro,
  situacao,
  h('div', { class: 'nuvem-botoes' }, bEntrar, bCriar),
  h('p', { class: 'dica pequena' }, 'Primeira vez? Digite um e-mail e uma senha e toque em “Criar conta”. No outro aparelho, use “Entrar” com os mesmos dados.'),
  h('div', { class: 'aviso-caixa', role: 'note' },
    'Ao entrar, o que já está neste aparelho é enviado para a nuvem e se junta ao que já está lá. Nada é apagado.'));
}
