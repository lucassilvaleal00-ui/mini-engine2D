/**
 * conversa.js — O que a IA recebe e como a resposta dela vira arquivos do jogo. Sem DOM.
 *
 * A IA não "lembra" sozinha entre conversas: quem lembra é o PROJETO. A cada pedido ela recebe
 * a memória do projeto (que ela mesma atualiza), os arquivos atuais, os assets chamados com @,
 * os títulos das outras conversas e as últimas mensagens da conversa atual.
 */

import { conversaAtual, nomeDeArquivoValido } from './projeto.js';

export const MAX_MENSAGENS_NO_CONTEXTO = 16;

export const REGRAS = `Você é o programador de jogos do Mini Engine. Você cria jogos 2D em pixel art para celular usando **Phaser 3.90** (série 3, NUNCA Phaser 4) em JavaScript puro. Responda sempre em português do Brasil, de forma curta e amigável: o usuário não é programador.

AMBIENTE DO JOGO (já pronto, não recrie):
- O Phaser 3.90 já está carregado como a variável global \`Phaser\`. Não use import, require, módulos, fetch nem links externos (não há internet no jogo).
- Existe um <div id="jogo"> que ocupa a área de teste inteira. Use \`parent: 'jogo'\` e
  \`scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }\`, \`pixelArt: true\`.
- Os sprites chamados pelo usuário com @ já vêm prontos: no \`preload()\` da primeira cena chame \`carregarAssets(this)\` e no \`create()\` chame \`criarAnimacoes(this)\`. Depois use as chaves listadas em ASSETS (ex.: \`this.add.sprite(x, y, 'heroi')\`, \`sprite.play('heroi')\` quando houver mais de 1 frame). A lista também existe em \`ASSETS.sprites\` (key, frameWidth, frameHeight, frames, fps). Cenários ficam em \`CENARIOS[key]\`.
- Arquivos .json que você criar ficam em \`DADOS['nome.json']\` (já convertidos em objeto).
- Os .js são carregados em ordem alfabética e o \`main.js\` por último: ponha nele o \`new Phaser.Game(config)\`.
- O jogo é para CELULAR primeiro: controles por toque (botões na tela, toque/arraste) e também teclado no PC.

REGRAS:
- NUNCA invente chaves de assets. Use só as que estão em ASSETS. Se faltar um sprite, use formas simples do Phaser no lugar e escreva o que falta em PENDENCIAS.
- Mantenha o código em arquivos pequenos e organizados (ex.: cenas/menu.js, mas o nome do arquivo não pode ter pastas: use menu.js, fase1.js…). Comente em português.
- Mantenha também JOGO.md (regras e controles do jogo) e HISTORIA.md (enredo e personagens) quando o assunto aparecer.
- Faça o pedido INTEIRO e funcionando. Prefira algo simples que roda a algo grande que quebra.
- Quando receber um ERRO do jogo, corrija a causa e explique em 1 frase.

FORMATO DA RESPOSTA (obrigatório):
1) Primeiro, uma explicação curta do que você fez (ou a resposta à pergunta).
2) Para cada arquivo criado ou alterado, o conteúdo COMPLETO (nunca só um trecho), assim:
===ARQUIVO: main.js===
(conteúdo completo do arquivo, sem crases de markdown)
===FIM===
3) Para apagar um arquivo: ===APAGAR: nome.js===
4) SEMPRE no final, a memória do projeto atualizada (o que o jogo já tem, decisões, controles, o que falta), em até 15 linhas:
===MEMORIA===
...
===FIM===
5) Se faltar algo que só o usuário pode fazer (desenhar um sprite, um cenário), liste:
===PENDENCIAS===
- ...
===FIM===
Se o pedido for só uma pergunta, responda sem blocos de arquivo (mas mande a MEMORIA).`;

/** Tira os blocos de arquivo de uma resposta antiga (o código atual vai à parte, inteiro). */
export function resumirMensagemDaIA(texto) {
  return String(texto)
    .replace(/===ARQUIVO:\s*([^=\n]+?)\s*===[\s\S]*?===FIM===/g, '[arquivo $1 atualizado]')
    .replace(/===MEMORIA===[\s\S]*?===FIM===/g, '')
    .replace(/===PENDENCIAS===[\s\S]*?===FIM===/g, '')
    .trim();
}

/** Monta { sistema, mensagens } para conversar(). */
export function montarPedido(projeto, { textoAssets, avisosAssets = [], imagensAtuais = null }) {
  const atual = conversaAtual(projeto);
  const outras = projeto.conversas.filter((c) => c.id !== atual.id && c.mensagens.length);
  const arquivos = Object.entries(projeto.arquivos)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([nome, texto]) => `===ARQUIVO: ${nome}===\n${texto}\n===FIM===`).join('\n\n');

  const contexto = [
    `PROJETO: "${projeto.nome}"`,
    `MEMÓRIA DO PROJETO (escrita por você nas conversas anteriores):\n${projeto.memoria || '(vazia: projeto novo)'}`,
    outras.length ? `OUTRAS CONVERSAS DESTE PROJETO (o que foi feito nelas já está na memória e nos arquivos):\n${outras.map((c) => `- ${c.titulo}`).join('\n')}` : '',
    projeto.pendencias.length ? `PENDÊNCIAS ABERTAS:\n${projeto.pendencias.map((p) => `- ${p}`).join('\n')}` : '',
    `ASSETS DISPONÍVEIS:\n${textoAssets}`,
    avisosAssets.length ? `AVISOS SOBRE ASSETS:\n${avisosAssets.map((a) => `- ${a}`).join('\n')}` : '',
    `ARQUIVOS ATUAIS DO JOGO:\n${arquivos || '(nenhum: o jogo ainda não existe)'}`,
  ].filter(Boolean).join('\n\n');

  const historico = atual.mensagens
    .filter((m) => m.papel === 'usuario' || (m.papel === 'ia' && !m.erro))
    .slice(-MAX_MENSAGENS_NO_CONTEXTO)
    .map((m) => ({
      papel: m.papel,
      texto: m.papel === 'ia' ? resumirMensagemDaIA(m.texto) : m.texto,
      imagens: m.papel === 'usuario' ? (m.imagens || []) : [],
    }));
  // imagens só da última mensagem do usuário (economiza)
  historico.forEach((m, i) => { if (i < historico.length - 1) m.imagens = []; });
  // a mensagem guarda só miniaturas; as imagens em tamanho bom vêm à parte, só no pedido em que foram anexadas
  if (imagensAtuais && historico.length && historico[historico.length - 1].papel === 'usuario') historico[historico.length - 1].imagens = imagensAtuais;

  return { sistema: `${REGRAS}\n\n---\n${contexto}`, mensagens: historico };
}

const tirarCercas = (t) => {
  const s = t.replace(/^\s*\n/, '').replace(/\s+$/, '');
  const m = /^```[a-zA-Z]*\n([\s\S]*?)\n?```$/.exec(s);
  return m ? m[1] : s;
};

/**
 * Lê a resposta da IA.
 * @returns { explicacao, arquivos: { nome: texto }, apagar: [nome], memoria: string|null, pendencias: [..]|null, ignorados: [nome] }
 */
export function lerResposta(texto) {
  const r = { explicacao: '', arquivos: {}, apagar: [], memoria: null, pendencias: null, ignorados: [] };
  const fonte = String(texto ?? '').replace(/\r\n/g, '\n');

  for (const m of fonte.matchAll(/===\s*ARQUIVO:\s*([^=\n]+?)\s*===\n([\s\S]*?)\n?===\s*FIM\s*===/g)) {
    const nome = m[1].trim().split('/').pop();
    if (nomeDeArquivoValido(nome)) r.arquivos[nome] = `${tirarCercas(m[2])}\n`;
    else r.ignorados.push(m[1].trim());
  }
  for (const m of fonte.matchAll(/===\s*APAGAR:\s*([^=\n]+?)\s*===/g)) {
    const nome = m[1].trim().split('/').pop();
    if (nomeDeArquivoValido(nome)) r.apagar.push(nome);
  }
  const mem = /===\s*MEMORIA\s*===\n?([\s\S]*?)(?:===\s*FIM\s*===|$)/.exec(fonte);
  if (mem) r.memoria = mem[1].trim().slice(0, 4000);
  const pend = /===\s*PENDENCIAS\s*===\n?([\s\S]*?)(?:===\s*FIM\s*===|$)/.exec(fonte);
  if (pend) r.pendencias = pend[1].split('\n').map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean).slice(0, 20);

  r.explicacao = fonte
    .replace(/===\s*ARQUIVO:[\s\S]*?===\s*FIM\s*===/g, '')
    .replace(/===\s*APAGAR:[^=\n]*===/g, '')
    .replace(/===\s*MEMORIA\s*===[\s\S]*?(===\s*FIM\s*===|$)/g, '')
    .replace(/===\s*PENDENCIAS\s*===[\s\S]*?(===\s*FIM\s*===|$)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // Resposta sem o formato, mas com um bloco ```js```: aproveita como main.js (só se não houver arquivos)
  if (!Object.keys(r.arquivos).length) {
    const bloco = /```(?:js|javascript)\n([\s\S]*?)```/.exec(fonte);
    if (bloco && /new Phaser\.Game/.test(bloco[1])) {
      r.arquivos['main.js'] = `${bloco[1].trim()}\n`;
      r.explicacao = r.explicacao.replace(bloco[0], '[código em main.js]').trim();
    }
  }
  return r;
}

/** Mensagem automática quando o jogo dá erro (correção automática). */
export function mensagemDeErro(erros, tentativa, maximo) {
  const lista = erros.slice(0, 5).map((e) => `- ${e.mensagem}${e.arquivo ? ` (${e.arquivo}${e.linha ? `, linha ${e.linha}` : ''})` : ''}`).join('\n');
  return `[Correção automática ${tentativa}/${maximo}] O jogo deu erro ao rodar:\n${lista}\nCorrija a causa.`;
}
