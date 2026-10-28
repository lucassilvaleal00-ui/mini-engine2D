/**
 * dom.js — Helper mínimo para montar elementos HTML sem frameworks.
 *
 *   h('button', { class: 'botao', onclick: fazer }, 'Salvar')
 *
 * Textos entram como nós de texto (nunca como HTML), então nomes digitados
 * pelo usuário não podem injetar código na página.
 */

export function h(tag, props, ...filhos) {
  const el = document.createElement(tag);
  for (const [nome, valor] of Object.entries(props || {})) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (nome === 'class') el.className = valor;
    else if (nome === 'dataset') Object.assign(el.dataset, valor);
    else if (nome === 'style' && typeof valor === 'object') Object.assign(el.style, valor);
    else if (nome.startsWith('on') && typeof valor === 'function') {
      el.addEventListener(nome.slice(2).toLowerCase(), valor);
    } else if (nome.startsWith('aria-') || nome.startsWith('data-') || nome === 'role') {
      el.setAttribute(nome, valor === true ? '' : valor);
    } else if (nome in el) el[nome] = valor;
    else el.setAttribute(nome, valor === true ? '' : valor);
  }
  adicionar(el, filhos);
  return el;
}

/**
 * Acrescenta filhos a `pai`, ignorando null/false e achatando listas.
 * Use no lugar de `pai.append(...)` sempre que um filho puder ser condicional
 * (`condicao && h(...)`): o append nativo escreveria o texto "null"/"false".
 */
export function adicionar(pai, filhos) {
  for (const filho of [filhos].flat(Infinity)) {
    if (filho === null || filho === undefined || filho === false) continue;
    pai.append(filho instanceof Node ? filho : document.createTextNode(String(filho)));
  }
  return pai;
}

/** Esvazia `pai` e coloca os `filhos` no lugar (com as mesmas regras de `adicionar`). */
export function preencher(pai, ...filhos) {
  pai.replaceChildren();
  return adicionar(pai, filhos);
}
