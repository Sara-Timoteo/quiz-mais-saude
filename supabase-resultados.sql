-- ============================================
-- FASE 2a — Tabela de RESULTADOS dos quizzes
-- Corre este SQL no Supabase Dashboard → SQL Editor
-- ============================================

-- Tabela: cada linha = um quiz concluído por um utente
CREATE TABLE IF NOT EXISTS resultados (
  id BIGSERIAL PRIMARY KEY,
  numero_beneficiario TEXT NOT NULL,
  id_nivel BIGINT REFERENCES niveis(id) ON DELETE SET NULL,
  nivel_nome TEXT,
  total_perguntas INT NOT NULL,
  acertos INT NOT NULL,
  percentagem INT NOT NULL,
  criado_em TIMESTAMPTZ DEFAULT now()
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_resultados_user
  ON resultados(numero_beneficiario, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_resultados_nivel
  ON resultados(id_nivel);

-- Activar RLS
ALTER TABLE resultados ENABLE ROW LEVEL SECURITY;

-- Políticas: anon e authenticated podem inserir e ler
-- (a Fase 3 vai apertar as permissões com auth de admins)
DROP POLICY IF EXISTS "anon_insert_resultados" ON resultados;
CREATE POLICY "anon_insert_resultados" ON resultados
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_read_resultados" ON resultados;
CREATE POLICY "anon_read_resultados" ON resultados
  FOR SELECT TO anon, authenticated
  USING (true);

-- Verificar que correu tudo bem:
SELECT 'Tabela resultados criada com sucesso ✓' AS estado;
