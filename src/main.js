/**
 * main.js — Ponto de entrada do Mini Engine.
 *
 * Registra as telas e liga o roteador. Cada tela é independente: se uma
 * etapa futura quebrar, as anteriores continuam funcionando.
 */

import { iniciarRoteador } from './core/router.js';
import { aviso } from './ui/toast.js';
import * as inicio from './screens/inicio.js';
import * as gerenciador from './screens/gerenciador.js';
import * as lixeira from './screens/lixeira.js';
import * as diagnostico from './screens/diagnostico.js';
import * as editor from './screens/editor.js';
import * as backup from './screens/backup.js';
import * as nuvem from './screens/nuvem.js';
import { iniciarSincronia } from './core/sincronia.js';
import * as jogo from './screens/jogo.js';
import { cenario } from './screens/em-breve.js';

// Mostra erros inesperados na tela (no celular ninguém vê o console).
window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  aviso(`Erro inesperado: ${e.reason?.message || e.reason}`, { tipo: 'erro', duracao: 6000 });
});

iniciarRoteador(document.getElementById('app'), {
  '': inicio,
  gerenciador,
  lixeira,
  diagnostico,
  editor,
  backup,
  nuvem,
  cenario,
  jogo,
});

// Sincronização com a nuvem (Supabase). Se não houver conta, fica desligada e nada acontece.
window.addEventListener('miniengine:nuvem', (e) => {
  const conflitos = e.detail?.resumo?.conflitos || [];
  if (conflitos.length) {
    aviso(`Alterado nos dois aparelhos: ${conflitos.join(', ')}. A versão deste aparelho ficou ao lado com “(conflito)” no nome.`, { tipo: 'erro', duracao: 9000 });
  }
});
iniciarSincronia().catch((erro) => console.error('[nuvem]', erro));
