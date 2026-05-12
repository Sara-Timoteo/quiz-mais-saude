-- ============================================
-- FASE 3 — Painel de Administradores
-- Correr este SQL no Supabase Dashboard → SQL Editor
-- ============================================

-- ============================================
-- 1. Tabela admins
-- ============================================
-- Liga cada user_id do Supabase Auth a um perfil admin (nome + cargo)

CREATE TABLE IF NOT EXISTS admins (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cargo TEXT,
  criado_em TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_admins_user ON admins(user_id);

-- ============================================
-- 2. Função is_admin() — verifica se o user actual é admin
-- ============================================

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(SELECT 1 FROM admins WHERE user_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION is_admin() TO anon, authenticated;

-- ============================================
-- 3. Tabela recompensas
-- ============================================

CREATE TABLE IF NOT EXISTS recompensas (
  id BIGSERIAL PRIMARY KEY,
  numero_beneficiario TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('imagem', 'voucher')),
  titulo TEXT NOT NULL,
  descricao TEXT,
  imagem_url TEXT,      -- só preenchido se tipo='imagem'
  voucher_codigo TEXT,  -- só preenchido se tipo='voucher'
  atribuido_por UUID REFERENCES auth.users(id),
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recompensas_beneficiario
  ON recompensas(numero_beneficiario, criado_em DESC);

-- ============================================
-- 4. RLS — Activar e definir políticas
-- ============================================

-- ===== admins =====
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_read_self" ON admins;
CREATE POLICY "admins_read_self" ON admins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin());

-- ===== recompensas =====
ALTER TABLE recompensas ENABLE ROW LEVEL SECURITY;

-- Admins têm CRUD total
DROP POLICY IF EXISTS "recompensas_admin_all" ON recompensas;
CREATE POLICY "recompensas_admin_all" ON recompensas
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- Anon (app de utente) pode ler as suas próprias recompensas
-- (não há autenticação no lado do utente — usa o número de beneficiário como chave)
DROP POLICY IF EXISTS "recompensas_anon_read" ON recompensas;
CREATE POLICY "recompensas_anon_read" ON recompensas
  FOR SELECT TO anon
  USING (true);

-- ===== Utilizadores (apertar regras agora que temos admins) =====
-- Admins têm CRUD total; anon continua a aceder via RPC verificar_beneficiario
ALTER TABLE "Utilizadores" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "utilizadores_admin_all" ON "Utilizadores";
CREATE POLICY "utilizadores_admin_all" ON "Utilizadores"
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- A RPC verificar_beneficiario continua a funcionar para anon
-- (porque é SECURITY DEFINER e bypassa a RLS)

-- ===== resultados (já tem RLS de Fase 2a) =====
-- Acrescentar policy de leitura para admins
DROP POLICY IF EXISTS "resultados_admin_read" ON resultados;
CREATE POLICY "resultados_admin_read" ON resultados
  FOR SELECT TO authenticated
  USING (is_admin());

-- ============================================
-- 5. Storage Bucket para imagens de recompensas
-- ============================================
-- NOTA: Cria o bucket "recompensas" manualmente no Dashboard → Storage → New Bucket
-- Marcar como "Public bucket". Depois corre este SQL para as políticas:

-- Apagar policies existentes (se houver)
DROP POLICY IF EXISTS "recompensas_imagens_public_read" ON storage.objects;
DROP POLICY IF EXISTS "recompensas_imagens_admin_write" ON storage.objects;

-- Toda a gente lê (URLs públicos para a app principal mostrar)
CREATE POLICY "recompensas_imagens_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'recompensas');

-- Só admins autenticados escrevem/apagam
CREATE POLICY "recompensas_imagens_admin_write" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'recompensas' AND is_admin())
  WITH CHECK (bucket_id = 'recompensas' AND is_admin());

-- ============================================
-- Confirmação
-- ============================================
SELECT
  'Tabelas e políticas criadas ✓' AS estado,
  (SELECT COUNT(*) FROM admins) AS total_admins_actuais,
  (SELECT COUNT(*) FROM recompensas) AS total_recompensas_actuais;

-- ============================================
-- INSTRUÇÕES PARA CRIAR O PRIMEIRO ADMIN:
-- ============================================
-- 1. Vai a Authentication → Users → Add user → cria com email + password
-- 2. Copia o user_id (UUID)
-- 3. Corre o INSERT abaixo (substitui os valores):
--
-- INSERT INTO admins (user_id, nome, cargo) VALUES
--   ('SUBSTITUIR-PELO-UUID-AQUI'::uuid, 'Nome do Admin', 'Coordenador');
--
-- Para criar mais admins, repete o passo 1+3 com outros emails.
