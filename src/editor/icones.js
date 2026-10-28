/**
 * icones.js — Ícones simples em SVG (traço). Textos fixos, escritos aqui; nada vem do usuário.
 */

const CAMINHOS = {
  lapis: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
  borracha: '<path d="M4 15l8-8 7 7-5 5H8z"/><path d="M9 10l7 7"/>',
  balde: '<path d="M5 11l7-7 7 7-7 7z"/><path d="M5 11h14"/><path d="M20 15c1 1.6 2 2.6 2 3.8a2 2 0 0 1-4 0c0-1.2 1-2.2 2-3.8z"/>',
  linha: '<path d="M5 19L19 5"/>',
  retangulo: '<rect x="4" y="6" width="16" height="12"/>',
  elipse: '<ellipse cx="12" cy="12" rx="8" ry="6"/>',
  'conta-gotas': '<path d="M15 4l5 5-3 1-1 1-8 8H5v-3l8-8 1-1z"/><path d="M13 7l4 4"/>',
  selecao: '<rect x="4" y="5" width="16" height="14" stroke-dasharray="3 3"/>',
  mover: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
  mao: '<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 12V4.5a1.5 1.5 0 0 1 3 0V12M14 12V6.5a1.5 1.5 0 0 1 3 0V14c0 4-2 7-6 7-3 0-4.5-1.7-5.8-4.2L4 14.5a1.5 1.5 0 0 1 2.6-1.4L8 15"/>',
  transformar: '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  desfazer: '<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 0 10"/>',
  refazer: '<path d="M15 7l5 5-5 5"/><path d="M20 12H10a6 6 0 0 0 0 10"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  lixeira: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  copiar: '<rect x="8" y="8" width="11" height="12"/><path d="M5 16V5h11"/>',
  tocar: '<path d="M7 4l12 8-12 8z"/>',
  pausar: '<path d="M8 5v14M16 5v14"/>',
  editar: '<path d="M4 20l1-4L16 5l3 3L8 19z"/>',
  salvar: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/>',
  voltar: '<path d="M15 5l-7 7 7 7"/>',
  anexo: '<path d="M18 11l-7 7a4 4 0 0 1-6-6l8-8a3 3 0 0 1 4 4l-8 8a1.5 1.5 0 0 1-2-2l7-7"/>',
  enviar: '<path d="M4 12l16-8-6 16-3-7z"/>',
  estrela: '<path d="M12 3l2.5 6 6.5.5-5 4.3 1.6 6.4L12 17l-5.6 3.2L8 13.8 3 9.5 9.5 9z"/>',
  grade: '<path d="M4 4h16v16H4zM4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16"/>',
  imagem: '<rect x="4" y="5" width="16" height="14"/><circle cx="9" cy="10" r="1.5"/><path d="M4 17l5-4 4 3 3-2 4 3"/>',
  baixar: '<path d="M12 4v11M8 11l4 4 4-4M5 20h14"/>',
  cebola: '<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6" stroke-dasharray="2 2"/>',
};

/** Devolve um elemento <svg> com o ícone pedido. */
export function icone(nome, tamanho = 22) {
  const modelo = document.createElement('template');
  modelo.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${CAMINHOS[nome] || ''}</svg>`;
  return modelo.content.firstElementChild;
}
