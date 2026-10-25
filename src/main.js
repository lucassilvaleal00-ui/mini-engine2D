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
import { editor, cenario, jogo } from './screens/em-breve.js';

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
  cenario,
  jogo,
});
