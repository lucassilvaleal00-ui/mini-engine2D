/** formato.js — Formatação de datas, números e textos em português do Brasil. */

const formatoDataHora = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatarDataHora = (ms) => formatoDataHora.format(new Date(ms));

export const pluralizar = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;

export function formatarBytes(bytes) {
  if (bytes === null || bytes === undefined) return '—';
  const unidades = ['B', 'KB', 'MB', 'GB', 'TB'];
  let valor = bytes;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i++;
  }
  return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: i === 0 ? 0 : 1 })} ${unidades[i]}`;
}
