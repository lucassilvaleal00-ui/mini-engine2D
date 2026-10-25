/**
 * backup.js — Backup e restauração do projeto inteiro (ZIP).
 *
 * Rota: #/backup
 *
 * Os dados do Mini Engine ficam só neste navegador. O backup é a proteção real contra
 * "limpei os dados do site", "troquei de celular" ou "o navegador apagou tudo".
 */

import { h, preencher } from '../ui/dom.js';
import { aviso, avisarErro } from '../ui/toast.js';
import { abrirDialogo } from '../ui/dialogos.js';
import { baixar, tamanhoLegivel } from '../ui/baixar.js';
import { formatarDataHora, pluralizar } from '../ui/formato.js';
import * as armazem from '../core/storage.js';
import {
  fazerBackup, registrarBackupFeito, situacaoDoBackup, lerBackup, restaurarBackup, nomeDaPastaRestaurada,
} from '../core/backup.js';
import { LIMITE_TOTAL } from '../core/zip.js';

const esperarPintar = () => new Promise((r) => setTimeout(r, 30));

function escolherZip() {
  return new Promise((resolve) => {
    const campo = h('input', { type: 'file', accept: '.zip,application/zip,application/x-zip-compressed', hidden: true });
    let resolvido = false;
    const fim = (arq) => { if (resolvido) return; resolvido = true; campo.remove(); resolve(arq); };
    campo.addEventListener('change', () => fim(campo.files?.[0] ?? null));
    campo.addEventListener('cancel', () => fim(null));
    document.body.append(campo);
    campo.click();
  });
}

const descricaoContagem = (c) => [
  c.pasta ? pluralizar(c.pasta, 'pasta', 'pastas') : null,
  c.sprite ? pluralizar(c.sprite, 'sprite', 'sprites') : null,
  c.cenario ? pluralizar(c.cenario, 'cenário', 'cenários') : null,
  c.jogo ? pluralizar(c.jogo, 'jogo', 'jogos') : null,
].filter(Boolean).join(', ') || 'nada';

export async function montar(el, { navegar, voltar }) {
  document.title = 'Backup · Mini Engine';

  const situacao = h('section', { class: 'painel backup-situacao', 'aria-live': 'polite' });
  const botaoBackup = h('button', { class: 'botao primario largo', type: 'button', onclick: () => criar() }, '⬇ Baixar backup (ZIP)');
  const botaoRestaurar = h('button', { class: 'botao largo', type: 'button', onclick: () => restaurar() }, '⬆ Restaurar de um backup');
  const resultado = h('div', { class: 'backup-resultado', hidden: true });

  el.append(
    h('header', { class: 'topo' },
      h('button', { class: 'botao', type: 'button', 'aria-label': 'Voltar', onclick: () => voltar('/') }, '←'),
      h('h1', {}, 'Backup')),
    h('p', { class: 'dica' }, 'Seus desenhos ficam guardados só neste navegador. Se você limpar os dados do site, trocar de aparelho ou o navegador precisar de espaço, eles podem sumir. O backup é um arquivo ZIP com tudo.'),
    situacao,
    h('div', { class: 'backup-acoes' }, botaoBackup, botaoRestaurar),
    resultado,
    h('section', { class: 'painel backup-notas' },
      h('h2', {}, 'Bom saber'),
      h('ul', { class: 'lista-simples' },
        h('li', {}, 'O ZIP leva pastas, sprites, cenários e jogos, na mesma organização de pastas.'),
        h('li', {}, 'A lixeira não entra.'),
        h('li', {}, 'As chaves de API das IAs nunca entram no backup: elas ficam só neste aparelho. Ao restaurar em outro aparelho, cole as chaves de novo.'),
        h('li', {}, 'Restaurar não apaga nem substitui nada: cria uma pasta nova chamada “Restaurado em …” com o conteúdo do backup.'),
        h('li', {}, 'Guarde o ZIP fora do navegador (Drive, e-mail, outro aparelho). Faça um backup de vez em quando.'))));

  async function desenharSituacao() {
    try {
      const { ultimo, total, alterados } = await situacaoDoBackup();
      const stats = await armazem.estatisticas();
      const linhas = [
        h('p', { class: 'backup-linha' }, h('strong', {}, 'Agora no app: '), descricaoContagem(stats)),
      ];
      if (!ultimo) {
        linhas.push(h('p', { class: 'backup-linha' }, h('strong', {}, 'Último backup: '), 'nenhum ainda.'));
        if (total > 0) linhas.push(h('div', { class: 'aviso-caixa atencao', role: 'note' }, 'Você ainda não fez backup. Faça agora: leva poucos segundos.'));
      } else {
        linhas.push(h('p', { class: 'backup-linha' }, h('strong', {}, 'Último backup: '), `${formatarDataHora(ultimo.em)} (${pluralizar(ultimo.itens, 'item', 'itens')})`));
        linhas.push(h('p', { class: 'backup-linha' }, alterados > 0
          ? `Desde então, ${pluralizar(alterados, 'item mudou', 'itens mudaram')}.`
          : 'Nada mudou desde então.'));
      }
      preencher(situacao, linhas);
    } catch (erro) {
      preencher(situacao, h('div', { class: 'aviso-caixa erro', role: 'alert' }, 'Não consegui ler o armazenamento do navegador. ', erro.message));
    }
  }

  async function criar() {
    botaoBackup.disabled = true;
    botaoBackup.textContent = 'Montando o ZIP…';
    resultado.hidden = true;
    await esperarPintar();
    try {
      const r = await fazerBackup();
      if (r.contagem.total === 0 && r.contagem.pasta === 0) {
        aviso('Ainda não há nada para guardar: crie ou salve algum desenho primeiro.', { tipo: 'erro' });
        return;
      }
      baixar(r.bytes, r.nome, 'application/zip');
      await registrarBackupFeito(r.contagem);
      aviso(`Backup baixado: ${r.nome} (${tamanhoLegivel(r.bytes.length)}).`, { tipo: 'ok', duracao: 7000 });
      preencher(resultado,
        h('div', { class: 'aviso-caixa', role: 'status' },
          h('strong', {}, 'Backup pronto. '), `${r.nome} · ${tamanhoLegivel(r.bytes.length)} · ${descricaoContagem(r.contagem)}. `,
          'Guarde esse arquivo em um lugar seguro, fora do navegador.'));
      resultado.hidden = false;
      await desenharSituacao();
    } catch (erro) {
      avisarErro(erro);
    } finally {
      botaoBackup.disabled = false;
      botaoBackup.textContent = '⬇ Baixar backup (ZIP)';
    }
  }

  /** Mostra o que há no backup e pergunta antes de gravar. */
  function confirmarRestauracao(arquivo, plano) {
    const nomePasta = nomeDaPastaRestaurada();
    return abrirDialogo(({ fechar }) => [
      h('h2', { class: 'dialogo-titulo' }, 'Restaurar este backup?'),
      h('p', { class: 'dialogo-texto' }, `“${arquivo.name}”${plano.criadoEm ? ` · feito em ${formatarDataHora(Date.parse(plano.criadoEm))}` : ''}`),
      h('p', { class: 'dialogo-texto' }, `Contém ${descricaoContagem(plano.contagem)}.`),
      h('div', { class: 'aviso-caixa', role: 'note' },
        `Vai ser criada a pasta “${nomePasta}” na raiz, com tudo dentro. Nada do que você tem agora é apagado ou substituído.`),
      plano.avisos.length > 0 && h('div', { class: 'aviso-caixa atencao', role: 'note' },
        h('strong', {}, `${pluralizar(plano.avisos.length, 'problema', 'problemas')} no arquivo:`),
        h('ul', { class: 'imp-lista' }, plano.avisos.slice(0, 8).map((t) => h('li', {}, t)),
          plano.avisos.length > 8 && h('li', {}, `…e mais ${plano.avisos.length - 8}.`))),
      h('div', { class: 'dialogo-botoes' },
        h('button', { class: 'botao', type: 'button', 'data-foco': '', onclick: () => fechar(false) }, 'Cancelar'),
        h('button', { class: 'botao primario', type: 'button', onclick: () => fechar(true) }, 'Restaurar')),
    ]).then((r) => r === true);
  }

  async function restaurar() {
    const arquivo = await escolherZip();
    if (!arquivo) return;
    resultado.hidden = true;
    botaoRestaurar.disabled = true;
    botaoRestaurar.textContent = 'Conferindo o arquivo…';
    await esperarPintar();
    try {
      if (arquivo.size > LIMITE_TOTAL) throw new Error('Esse arquivo é grande demais para abrir aqui.');
      const plano = await lerBackup(new Uint8Array(await arquivo.arrayBuffer()));
      botaoRestaurar.textContent = '⬆ Restaurar de um backup';
      if (!plano.itens.length) {
        aviso('Esse backup não tem nenhum item que dê para restaurar.', { tipo: 'erro', duracao: 6000 });
        return;
      }
      if (!(await confirmarRestauracao(arquivo, plano))) return;
      botaoRestaurar.textContent = 'Restaurando…';
      await esperarPintar();
      const r = await restaurarBackup(plano);
      preencher(resultado,
        h('div', { class: 'aviso-caixa', role: 'status' },
          h('strong', {}, 'Backup restaurado. '),
          `${pluralizar(r.criados, 'item entrou', 'itens entraram')} na pasta “${r.pasta.nome}”.`,
          r.renomeados > 0 ? ` ${pluralizar(r.renomeados, 'nome foi ajustado', 'nomes foram ajustados')} para não repetir ou usar símbolos proibidos.` : '',
          ' ',
          h('button', { class: 'link', type: 'button', onclick: () => navegar(`/gerenciador/${r.pasta.id}`) }, 'Abrir a pasta')));
      resultado.hidden = false;
      aviso('Backup restaurado.', { tipo: 'ok' });
      await desenharSituacao();
    } catch (erro) {
      avisarErro(erro);
    } finally {
      botaoRestaurar.disabled = false;
      botaoRestaurar.textContent = '⬆ Restaurar de um backup';
    }
  }

  await desenharSituacao();
}
