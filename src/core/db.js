/**
 * db.js — Acesso de baixo nível ao IndexedDB.
 *
 * Três "stores" (tabelas):
 *   - itens : metadados leves de cada item (nome, tipo, pasta-mãe, datas, lixeira)
 *   - dados : o conteúdo pesado (JSON do sprite, do cenário...), um registro por item
 *   - meta  : pequenas configurações internas (chave/valor)
 *
 * Separar "itens" de "dados" mantém a lista de pastas rápida no celular:
 * abrir uma pasta lê só os metadados, nunca os desenhos inteiros.
 *
 * Nenhum outro módulo deve falar direto com o IndexedDB — tudo passa por aqui
 * e por storage.js.
 */

const NOME_BANCO = 'mini-engine';
const VERSAO_BANCO = 1;
const STORES = ['itens', 'dados', 'meta'];

let promessaBanco = null;

export function indexedDBDisponivel() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/** Abre (ou cria) o banco. A conexão é reaproveitada entre chamadas. */
export function abrirBanco() {
  if (promessaBanco) return promessaBanco;

  promessaBanco = new Promise((resolve, reject) => {
    if (!indexedDBDisponivel()) {
      reject(new Error('Este navegador não oferece IndexedDB (ou ele está bloqueado, como em algumas abas privadas).'));
      return;
    }
    const req = indexedDB.open(NOME_BANCO, VERSAO_BANCO);

    // Criação/atualização da estrutura. Novas versões do banco entram aqui.
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('itens')) {
        const itens = db.createObjectStore('itens', { keyPath: 'id' });
        itens.createIndex('paiId', 'paiId', { unique: false });
        itens.createIndex('tipo', 'tipo', { unique: false });
        itens.createIndex('lixeiraLote', 'lixeiraLote', { unique: false });
      }
      if (!db.objectStoreNames.contains('dados')) {
        db.createObjectStore('dados', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'chave' });
      }
    };

    req.onsuccess = () => {
      const db = req.result;
      // Se outra aba precisar atualizar o banco, soltamos a conexão.
      db.onversionchange = () => {
        db.close();
        promessaBanco = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('Falha ao abrir o banco de dados.'));
    req.onblocked = () => console.warn('[db] Abertura bloqueada por outra aba do Mini Engine.');
  });

  // Se falhar, a próxima chamada tenta de novo em vez de ficar presa no erro.
  promessaBanco.catch(() => { promessaBanco = null; });
  return promessaBanco;
}

/** Converte um IDBRequest em Promise. */
export function pedido(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Executa `fn` dentro de UMA transação. Tudo que `fn` fizer é atômico:
 * se der erro, nada é gravado.
 *
 * `fn` recebe { itens, dados, meta } (as stores) e pode usar await — mas só
 * em pedidos do IndexedDB (via `pedido`). Não espere por fetch/timers dentro
 * dela, senão a transação fecha sozinha.
 */
export async function transacao(modo, fn) {
  const db = await abrirBanco();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORES, modo);
    let resultado;
    t.oncomplete = () => resolve(resultado);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Operação cancelada.'));

    let execucao;
    try {
      execucao = Promise.resolve(fn({
        itens: t.objectStore('itens'),
        dados: t.objectStore('dados'),
        meta: t.objectStore('meta'),
      }));
    } catch (erro) {
      execucao = Promise.reject(erro);
    }
    execucao.then(
      (r) => { resultado = r; },
      (erro) => {
        try { t.abort(); } catch { /* já finalizada */ }
        reject(erro);
      },
    );
  });
}

/** Lê uma configuração interna (ou `padrao` se não existir). */
export async function lerMeta(chave, padrao = null) {
  const r = await transacao('readonly', ({ meta }) => pedido(meta.get(chave)));
  return r ? r.valor : padrao;
}

export function gravarMeta(chave, valor) {
  return transacao('readwrite', ({ meta }) => pedido(meta.put({ chave, valor })));
}
