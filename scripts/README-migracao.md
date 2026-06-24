# Migração do Banco Real (SQLite → Supabase)

## Pré-requisitos
- Ter o arquivo `.sqlite` copiado para esta máquina
- `.env.local` configurado com as credenciais do Supabase

## Executar

```bash
npx tsx scripts/migrate.ts C:\caminho\para\banco-real.sqlite
```

## O que o script faz

1. Abre o arquivo `.sqlite` em modo leitura (não altera o original)
2. Lista as tabelas encontradas no SQLite
3. Detecta automaticamente a tabela de clientes
4. Insere no Supabase em lotes de 100
5. Usa `upsert` — pode ser executado mais de uma vez sem duplicar dados

## Mapeamento de colunas

O script detecta automaticamente colunas com nomes comuns (`cod`, `codigo`, `nome`, `razao_social`, `cnpj`, `regime`, etc).
Se o banco real usar nomes diferentes, edite a seção `migrarClientes()` em `scripts/migrate.ts`.
