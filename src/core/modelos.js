/**
 * modelos.js — Dados iniciais (em branco) de cada tipo de item.
 *
 * O sprite segue o formato do projeto (version, name, size, palette, layers, fps).
 * O editor da etapa 2 vai acrescentar "acoes", "origem" e "hitbox".
 * O cenário é PROVISÓRIO: o formato definitivo será fechado na etapa 4.
 */

/** Sprite em branco: 1 camada, 1 quadro, só a cor transparente. */
export function spriteVazio(nome, tamanho = 32) {
  const linha = '0'.repeat(tamanho);
  return {
    version: 1,
    name: nome,
    size: [tamanho, tamanho],
    palette: ['transparent'],
    layers: [{ name: 'corpo', frames: [Array.from({ length: tamanho }, () => linha)] }],
    fps: 8,
  };
}

/** Cenário em branco com as 3 camadas de profundidade (1 fundo, 2 meio, 3 frente). */
export function cenarioVazio(nome) {
  return {
    version: 1,
    name: nome,
    provisorio: true,
    camadas: [
      { ordem: 1, nome: 'fundo', objetos: [] },
      { ordem: 2, nome: 'meio', objetos: [] },
      { ordem: 3, nome: 'frente', objetos: [] },
    ],
  };
}
