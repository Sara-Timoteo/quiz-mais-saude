-- ============================================
-- LIMPEZA — Remover tabelas de medicação do Supabase
-- (Medicação passou a ser armazenada localmente no dispositivo
-- do utente, para garantir privacidade. Estas tabelas já não
-- são usadas pela app.)
--
-- Corre este SQL apenas se já tinhas executado o
-- supabase-medicamentos.sql anteriormente.
-- ============================================

DROP TABLE IF EXISTS historico_medicacao;
DROP TABLE IF EXISTS agendamentos;

SELECT 'Tabelas de medicação removidas do Supabase ✓' AS estado;
