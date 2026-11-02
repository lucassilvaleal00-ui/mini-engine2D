/**
 * entrar.js (tela) — Login na abertura do app.
 *
 * Rota: #/entrar
 *
 * Sem conta ligada neste aparelho, todas as telas mandam para cá (veja `guardaDeLogin` em main.js).
 * Depois de entrar, volta para a tela que a pessoa queria abrir.
 * "Continuar sem entrar" vale só até fechar a aba: os desenhos ficam neste aparelho e não sincronizam.
 */

import { h } from '../ui/dom.js';
import { aviso } from '../ui/toast.js';
import { formularioDeEntrada } from '../ui/form-entrada.js';
import { sessaoAtual } from '../core/nuvem.js';
import { estadoDaSincronia } from '../core/sincronia.js';

const CHAVE_DESTINO = 'miniengine.depoisDoLogin';
const CHAVE_SEM_CONTA = 'miniengine.semConta';

function sessao() {
  try { return globalThis.sessionStorage; } catch { return null; }
}

/** Guarda do roteador: devolve '/entrar' se a tela precisa de login, ou null. */
export function guardaDeLogin(chave, caminhoCompleto) {
  if (chave === 'entrar' || sessaoAtual()) return null;
  const s = sessao();
  if (s?.getItem(CHAVE_SEM_CONTA) === '1') return null;
  try { s?.setItem(CHAVE_DESTINO, caminhoCompleto || '/'); } catch { /* sem sessionStorage */ }
  return '/entrar';
}

function destino() {
  const s = sessao();
  const d = s?.getItem(CHAVE_DESTINO) || '/';
  try { s?.removeItem(CHAVE_DESTINO); } catch { /* ok */ }
  return d.startsWith('/entrar') ? '/' : d;
}

export async function montar(el, { navegar }) {
  document.title = 'Entrar · Mini Engine';
  if (sessaoAtual()) { navegar(destino(), { substituir: true }); return undefined; }

  const e = estadoDaSincronia();
  const erroInicial = e.fase === 'erro' && e.erro ? e.erro : null;

  el.append(
    h('header', { class: 'marca' },
      h('h1', {}, 'Mini Engine'),
      h('p', {}, 'Entre para ter seus desenhos, cenários e jogos no PC e no celular.')),
    h('div', { class: 'entrar-corpo' },
      formularioDeEntrada({
        erroInicial,
        aoEntrar: ({ criou, estado }) => {
          if (estado.fase === 'erro' || estado.fase === 'sem_rede') {
            aviso(`Você entrou, mas a primeira sincronização falhou: ${estado.erro}. Veja em ☁️ Nuvem → Testar a conexão.`, { tipo: 'erro', duracao: 9000 });
          } else {
            aviso(criou ? 'Conta criada. Este aparelho está sincronizado.' : 'Pronto: este aparelho está sincronizado.', { tipo: 'ok' });
          }
          navegar(destino(), { substituir: true });
        },
      }),
      h('p', { class: 'entrar-sem-conta' },
        h('button', {
          class: 'link', type: 'button',
          onclick: () => {
            try { sessao()?.setItem(CHAVE_SEM_CONTA, '1'); } catch { /* ok */ }
            navegar(destino(), { substituir: true });
          },
        }, 'Continuar sem entrar'),
        h('span', { class: 'dica pequena' }, ' — os desenhos ficam só neste aparelho e não sincronizam.'))),
  );
  return undefined;
}
