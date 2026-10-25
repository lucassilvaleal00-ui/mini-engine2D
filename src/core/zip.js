/**
 * zip.js — Ler e gravar arquivos ZIP, sem bibliotecas externas.
 *
 * - Gravação: método "deflate" (via CompressionStream do navegador) quando ajuda,
 *   senão "store" (sem compressão). Nomes em UTF-8.
 * - Leitura: aceita "store" e "deflate"; recusa ZIP com senha e ZIP64.
 *   Confere o CRC32 de cada arquivo e protege contra caminhos perigosos ("../") e
 *   contra arquivos que dizem ser pequenos mas descompactam enormes ("zip bomb").
 *
 * Sem DOM: roda também no Node (testes).
 */

export class ErroDeZip extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroDeZip';
  }
}

export const LIMITE_ARQUIVO = 300 * 1024 * 1024; // um arquivo descompactado
export const LIMITE_TOTAL = 1024 * 1024 * 1024;  // tudo descompactado
export const LIMITE_ENTRADAS = 50_000;

/* ------------------------------------------------------------------ */
/* CRC-32                                                              */
/* ------------------------------------------------------------------ */

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ------------------------------------------------------------------ */
/* Deflate (compressão do navegador)                                   */
/* ------------------------------------------------------------------ */

const temStreams = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

async function passarPor(transformador, bytes) {
  const resposta = new Response(new Blob([bytes]).stream().pipeThrough(transformador));
  return new Uint8Array(await resposta.arrayBuffer());
}

const deflate = (bytes) => passarPor(new CompressionStream('deflate-raw'), bytes);
const inflate = (bytes) => passarPor(new DecompressionStream('deflate-raw'), bytes);

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const codificador = new TextEncoder();
const decodificador = new TextDecoder('utf-8', { fatal: false });

function dataDos(data) {
  const ano = Math.max(1980, data.getFullYear());
  const hora = (data.getHours() << 11) | (data.getMinutes() << 5) | (data.getSeconds() >> 1);
  const dia = ((ano - 1980) << 9) | ((data.getMonth() + 1) << 5) | data.getDate();
  return { hora: hora & 0xffff, dia: dia & 0xffff };
}

/** Normaliza e valida um caminho dentro do ZIP. Devolve o caminho limpo ou lança ErroDeZip. */
export function caminhoSeguro(nome) {
  const limpo = String(nome).replace(/\\/g, '/');
  if (!limpo || limpo.startsWith('/') || /^[a-zA-Z]:/.test(limpo) || limpo.includes('\0')) {
    throw new ErroDeZip(`O ZIP tem um caminho inválido: “${nome}”.`);
  }
  const partes = limpo.split('/').filter((p) => p !== '' && p !== '.');
  if (partes.some((p) => p === '..')) throw new ErroDeZip(`O ZIP tem um caminho perigoso (“..”): “${nome}”.`);
  return partes.join('/') + (limpo.endsWith('/') ? '/' : '');
}

/* ------------------------------------------------------------------ */
/* Gravar                                                              */
/* ------------------------------------------------------------------ */

/**
 * @param arquivos  [{ caminho: 'pasta/arquivo.json', dados: Uint8Array | string, data?: Date }]
 * @param opcoes    { comprimir = true }
 * @returns Uint8Array com o ZIP pronto
 */
export async function criarZip(arquivos, { comprimir = true } = {}) {
  if (arquivos.length > 65_535) throw new ErroDeZip('Arquivos demais para um ZIP (máximo 65.535).');
  const partes = [];
  const central = [];
  let deslocamento = 0;
  const usarDeflate = comprimir && temStreams();

  for (const arq of arquivos) {
    const nome = codificador.encode(caminhoSeguro(arq.caminho));
    const bruto = typeof arq.dados === 'string' ? codificador.encode(arq.dados) : arq.dados;
    if (bruto.length > 0xfffffffe) throw new ErroDeZip(`“${arq.caminho}” é grande demais para este formato de ZIP.`);

    let metodo = 0;
    let conteudo = bruto;
    if (usarDeflate && bruto.length > 64) {
      const menor = await deflate(bruto);
      if (menor.length < bruto.length) { metodo = 8; conteudo = menor; }
    }
    const { hora, dia } = dataDos(arq.data ?? new Date());
    const crc = crc32(bruto);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);        // versão necessária
    local.setUint16(6, 0x0800, true);    // nomes em UTF-8
    local.setUint16(8, metodo, true);
    local.setUint16(10, hora, true);
    local.setUint16(12, dia, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, conteudo.length, true);
    local.setUint32(22, bruto.length, true);
    local.setUint16(26, nome.length, true);
    local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nome, conteudo);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, metodo, true);
    c.setUint16(12, hora, true);
    c.setUint16(14, dia, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, conteudo.length, true);
    c.setUint32(24, bruto.length, true);
    c.setUint16(28, nome.length, true);
    c.setUint32(42, deslocamento, true);
    central.push(new Uint8Array(c.buffer), nome);

    deslocamento += 30 + nome.length + conteudo.length;
    if (deslocamento > 0xfffffffe) throw new ErroDeZip('O ZIP ficou grande demais (mais de 4 GB).');
  }

  const tamanhoCentral = central.reduce((s, p) => s + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamanhoCentral, true);
  fim.setUint32(16, deslocamento, true);

  const todas = [...partes, ...central, new Uint8Array(fim.buffer)];
  const saida = new Uint8Array(todas.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  for (const p of todas) { saida.set(p, pos); pos += p.length; }
  return saida;
}

/* ------------------------------------------------------------------ */
/* Ler                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Lê o índice do ZIP (rápido, sem descompactar nada).
 * @returns [{ caminho, ehPasta, tamanho, ler(): Promise<Uint8Array> }]
 */
export function lerZip(bytes) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 22) throw new ErroDeZip('Esse arquivo não parece ser um ZIP (muito pequeno).');

  // fim do diretório central: procura a assinatura de trás para a frente
  let fim = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) {
    if (vista.getUint32(i, true) === 0x06054b50) { fim = i; break; }
  }
  if (fim < 0) throw new ErroDeZip('Esse arquivo não parece ser um ZIP (ou está incompleto/corrompido).');

  const total = vista.getUint16(fim + 10, true);
  const tamCentral = vista.getUint32(fim + 12, true);
  const iniCentral = vista.getUint32(fim + 16, true);
  if (total === 0xffff || tamCentral === 0xffffffff || iniCentral === 0xffffffff) {
    throw new ErroDeZip('ZIPs enormes (ZIP64) não são suportados.');
  }
  if (total > LIMITE_ENTRADAS) throw new ErroDeZip(`O ZIP tem arquivos demais (${total}).`);
  if (iniCentral + tamCentral > bytes.length) throw new ErroDeZip('O ZIP está incompleto ou corrompido.');

  const entradas = [];
  let pos = iniCentral;
  let somaDeclarada = 0;
  for (let n = 0; n < total; n++) {
    if (pos + 46 > bytes.length || vista.getUint32(pos, true) !== 0x02014b50) {
      throw new ErroDeZip('O índice do ZIP está corrompido.');
    }
    const flags = vista.getUint16(pos + 8, true);
    const metodo = vista.getUint16(pos + 10, true);
    const crc = vista.getUint32(pos + 16, true);
    const tamComp = vista.getUint32(pos + 20, true);
    const tamOrig = vista.getUint32(pos + 24, true);
    const lenNome = vista.getUint16(pos + 28, true);
    const lenExtra = vista.getUint16(pos + 30, true);
    const lenComentario = vista.getUint16(pos + 32, true);
    const deslocamento = vista.getUint32(pos + 42, true);
    const nomeBruto = decodificador.decode(bytes.subarray(pos + 46, pos + 46 + lenNome));
    pos += 46 + lenNome + lenExtra + lenComentario;

    const caminho = caminhoSeguro(nomeBruto);
    const ehPasta = caminho.endsWith('/');
    if (flags & 1) throw new ErroDeZip(`“${caminho}” está protegido por senha; esse ZIP não pode ser lido.`);
    if (tamComp === 0xffffffff || tamOrig === 0xffffffff) throw new ErroDeZip('ZIPs enormes (ZIP64) não são suportados.');
    if (tamOrig > LIMITE_ARQUIVO) throw new ErroDeZip(`“${caminho}” é grande demais para abrir aqui.`);
    somaDeclarada += tamOrig;
    if (somaDeclarada > LIMITE_TOTAL) throw new ErroDeZip('O conteúdo do ZIP é grande demais para abrir aqui.');

    entradas.push({
      caminho,
      ehPasta,
      tamanho: tamOrig,
      async ler() {
        if (ehPasta) return new Uint8Array(0);
        if (metodo !== 0 && metodo !== 8) throw new ErroDeZip(`“${caminho}” usa uma compressão não suportada.`);
        if (deslocamento + 30 > bytes.length || vista.getUint32(deslocamento, true) !== 0x04034b50) {
          throw new ErroDeZip(`“${caminho}” está corrompido dentro do ZIP.`);
        }
        const inicio = deslocamento + 30 + vista.getUint16(deslocamento + 26, true) + vista.getUint16(deslocamento + 28, true);
        if (inicio + tamComp > bytes.length) throw new ErroDeZip(`“${caminho}” está cortado (ZIP incompleto).`);
        const comprimido = bytes.subarray(inicio, inicio + tamComp);
        let dados;
        if (metodo === 0) dados = comprimido.slice();
        else {
          if (!temStreams()) throw new ErroDeZip('Este navegador não consegue abrir ZIP comprimido. Atualize o navegador.');
          try { dados = await inflate(comprimido); } catch { throw new ErroDeZip(`“${caminho}” está corrompido dentro do ZIP.`); }
        }
        if (dados.length !== tamOrig || crc32(dados) !== crc) {
          throw new ErroDeZip(`“${caminho}” está corrompido (a verificação de integridade falhou).`);
        }
        return dados;
      },
    });
  }
  return entradas;
}

/** Atalho: lê um arquivo de texto UTF-8 do ZIP. */
export async function lerTexto(entrada) {
  return decodificador.decode(await entrada.ler());
}
