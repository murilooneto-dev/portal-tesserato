// Escapa valor pra uso seguro dentro de um template HTML montado à mão
// (document.write das janelas de impressão). Nunca confiar em dado do banco
// nesses templates sem passar por aqui — a política de RLS por trás dele
// não impede um usuário autenticado de gravar HTML/script como texto.
export function escapeHtml(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
