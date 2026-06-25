-- ============================================================
-- TESSERATO FISCAL — MIGRATION SCRIPT COMPLETO
-- Execute no Supabase SQL Editor (Dashboard → SQL Editor)
-- Todas as instruções usam IF NOT EXISTS / IF EXISTS para
-- ser seguro rodar mais de uma vez sem erros.
-- ============================================================


-- ============================================================
-- 1. TABELA: clientes
-- ============================================================

-- Grupo/regime simplificado (normal | simples | mei)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS grupo text;

-- Município e UF separados
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS municipio text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS uf       text;

-- Configurações ISS
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS envia_iss       boolean DEFAULT false;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS login_iss       text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS senha_iss       text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS email_envio_iss text;

-- Conferência SIGA
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS confere_siga boolean DEFAULT false;

-- Declaração anual
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS declaracao_anual boolean DEFAULT false;

-- Tarefas personalizadas (substitui as padrão do grupo)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS tarefas_personalizadas text[];

-- Garantir que mit seja text (era date em algumas versões)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clientes' AND column_name = 'mit'
    AND data_type <> 'text'
  ) THEN
    ALTER TABLE clientes ALTER COLUMN mit TYPE text USING mit::text;
  END IF;
END $$;

-- Preencher grupo com base no regime existente (migração de dados)
UPDATE clientes
SET grupo = CASE
  WHEN LOWER(regime) LIKE '%simples%' THEN 'simples'
  WHEN LOWER(regime) LIKE '%mei%'     THEN 'mei'
  ELSE 'normal'
END
WHERE grupo IS NULL;


-- ============================================================
-- 2. TABELA: profiles
-- ============================================================

-- Abas que o usuário tem permissão de acessar
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS abas_acesso text[] DEFAULT '{}';

-- Garantir coluna cor com valor padrão
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cor text DEFAULT '#6366f1';

-- Garantir coluna setor
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS setor text DEFAULT 'fiscal';


-- ============================================================
-- 3. TABELA: app_settings
-- ============================================================

-- Garantir que a linha id=1 existe
INSERT INTO app_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Comunicado do dashboard (pode já existir)
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS dashboard_announcement text DEFAULT '';

-- Rotinas de e-mail — configuração geral
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS email_ativo       text DEFAULT 'false';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS gmail_remetente   text DEFAULT '';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS gmail_senha       text DEFAULT '';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS email_destinatario text DEFAULT '';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS usar_senha_app    text DEFAULT 'false';

-- Rotina 1
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS rotina1_ativo text DEFAULT 'false';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS rotina1_dia   text DEFAULT '';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS rotina1_hora  text DEFAULT '';

-- Rotina 2
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS rotina2_ativo text DEFAULT 'false';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS rotina2_dia   text DEFAULT '';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS rotina2_hora  text DEFAULT '';

-- Rotinas de log (4 slots)
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS log1_ativo text DEFAULT 'false';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS log1_dia   text DEFAULT '';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS log1_hora  text DEFAULT '';

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS log2_ativo text DEFAULT 'false';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS log2_dia   text DEFAULT '';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS log2_hora  text DEFAULT '';

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS log3_ativo text DEFAULT 'false';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS log3_dia   text DEFAULT '';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS log3_hora  text DEFAULT '';

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS log4_ativo text DEFAULT 'false';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS log4_dia   text DEFAULT '';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS log4_hora  text DEFAULT '';


-- ============================================================
-- 4. TABELA: tarefas
-- Verificar que constraint única existe para o upsert funcionar
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tarefas_cliente_mes_ano_tipo_key'
  ) THEN
    ALTER TABLE tarefas
      ADD CONSTRAINT tarefas_cliente_mes_ano_tipo_key
      UNIQUE (cliente_id, mes, ano, tipo);
  END IF;
END $$;


-- ============================================================
-- 5. NORMALIZAR responsáveis em parcelamentos
-- Converte para ProperCase eliminando variações de caixa
-- (ex: "DAYNNE" e "Daynne" → "Daynne")
-- ============================================================

UPDATE parcelamentos
SET responsavel = INITCAP(LOWER(TRIM(responsavel)))
WHERE responsavel IS NOT NULL
  AND responsavel <> INITCAP(LOWER(TRIM(responsavel)));


-- ============================================================
-- 6. NORMALIZAR responsáveis em clientes
-- ============================================================

UPDATE clientes
SET responsavel = INITCAP(LOWER(TRIM(responsavel)))
WHERE responsavel IS NOT NULL
  AND responsavel <> INITCAP(LOWER(TRIM(responsavel)));


-- ============================================================
-- 7. ÍNDICES úteis para performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_clientes_responsavel
  ON clientes (LOWER(responsavel));

CREATE INDEX IF NOT EXISTS idx_clientes_grupo
  ON clientes (grupo);

CREATE INDEX IF NOT EXISTS idx_tarefas_cliente_mes_ano
  ON tarefas (cliente_id, mes, ano);

CREATE INDEX IF NOT EXISTS idx_parcelamentos_responsavel
  ON parcelamentos (LOWER(responsavel));


-- ============================================================
-- FIM DO SCRIPT
-- ============================================================
