-- ============================================
-- QUIZ MAIS SAÚDE — Setup do Supabase (versão real)
-- ============================================
-- A tua tabela 'Utilizadores' já existe com este esquema:
--   anonascimento  bigint
--   numbeneficiario text
--
-- Este script faz 3 coisas:
--   1. Adiciona um índice para login rápido (5000+ linhas → milissegundos)
--   2. Cria a função 'verificar_beneficiario' que a app vai usar
--   3. Activa Row Level Security para que ninguém consiga enumerar a tabela
-- ============================================

-- ============================================
-- 1. ÍNDICE COMPOSTO PARA LOGIN RÁPIDO
-- ============================================
CREATE INDEX IF NOT EXISTS idx_utilizadores_login
  ON public."Utilizadores" (numbeneficiario, anonascimento);

-- ============================================
-- 2. FUNÇÃO DE VERIFICAÇÃO (CHAMADA PELO LOGIN)
-- ============================================
-- A app chama esta função em vez de aceder à tabela directamente.
-- SECURITY DEFINER faz com que corra com privilégios elevados,
-- ignorando RLS — mas só devolve uma linha se o par exacto existir.
CREATE OR REPLACE FUNCTION public.verificar_beneficiario(
  p_numero TEXT,
  p_ano INT
)
RETURNS TABLE (numbeneficiario TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT u.numbeneficiario
  FROM public."Utilizadores" u
  WHERE u.numbeneficiario = p_numero
    AND u.anonascimento = p_ano
  LIMIT 1;
END;
$$;

-- Permitir que utilizadores anónimos (login) chamem a função
GRANT EXECUTE ON FUNCTION public.verificar_beneficiario(TEXT, INT) TO anon;

-- ============================================
-- 3. ROW LEVEL SECURITY (IMPORTANTE PARA SEGURANÇA)
-- ============================================
-- Sem isto, qualquer pessoa com a anon key consegue listar
-- TODA a tabela de beneficiários. Activa já.
ALTER TABLE public."Utilizadores" ENABLE ROW LEVEL SECURITY;

-- Sem nenhuma policy criada, a tabela fica completamente inacessível
-- por leituras directas via anon. A função acima continua a funcionar
-- por ser SECURITY DEFINER.

-- ============================================
-- VERIFICAR QUE FUNCIONOU
-- ============================================

-- A. Quantos beneficiários estão na tabela?
-- SELECT COUNT(*) FROM "Utilizadores";

-- B. Testar a função (substitui pelos valores de uma linha real):
-- SELECT * FROM verificar_beneficiario('123456', 1980);
--    → deve devolver 1 linha se existir
-- SELECT * FROM verificar_beneficiario('inexistente', 1900);
--    → deve devolver 0 linhas

-- ============================================
-- SE A TABELA UTILIZADORES ESTÁ VAZIA
-- ============================================
-- Para importar os 5000+ beneficiários do Google Sheets:
--
-- 1. No Google Sheets, garante que a linha 1 tem exactamente:
--      numbeneficiario     anonascimento
--    (atenção: SEM underscore, tudo minúsculas)
--
-- 2. Ficheiro → Transferir → Valores separados por vírgulas (.csv)
--
-- 3. No Supabase → Table Editor → tabela 'Utilizadores'
--    → botão Insert → Import data from CSV
--    → sobe o ficheiro CSV
--    → confirma o mapeamento das colunas
--    → Import
--
-- 4. Volta ao SQL Editor e corre o COUNT em A. Devem aparecer 5000+.
