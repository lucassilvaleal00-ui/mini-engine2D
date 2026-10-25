/**
 * baixar.js — Entrega um arquivo gerado no navegador para o aparelho (download).
 * Funciona sem servidor: cria um link temporário para os dados e "clica" nele.
 */

export function baixar(bytes, nome, tipo = 'application/octet-stream') {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  // dá tempo ao navegador de começar o download antes de liberar a memória
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** "12 KB", "3,4 MB" */
export function tamanhoLegivel(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
