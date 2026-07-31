// lib/anexos.ts

export const TIPOS_ARQUIVO_PERMITIDOS = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
]

export const TAMANHO_MAX_ARQUIVO = 10 * 1024 * 1024 // 10 MB
