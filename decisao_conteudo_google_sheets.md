# Decisão: gestão de conteúdo via Google Sheets + importação com revisão

**Data:** 2026-07-21 · **Estado:** Aceite · **Âmbito:** Fase 4 (níveis / percurso do quiz)

## Contexto

Os níveis e as perguntas do quiz precisam de ser mantidos por pessoas **não técnicas**
(equipa do programa abem:/Dignitude), sem acesso ao Supabase nem conhecimentos de base de dados.
Ao mesmo tempo, a aplicação vai a conferência (TEEM 2026) e tem de ficar **à prova de auditoria**:
o conteúdo não pode chegar à app sem um momento de controlo.

## Decisão

O conteúdo (tabelas `niveis` e `quiz_questoes`) passa a ser **gerido numa Google Sheet** com duas
tabs (`niveis` e `Questoes`), publicadas como CSV. A informação entra no Supabase por um botão
**"Importar do Google Sheets"** no **painel admin** (separador *Conteúdo*), com o fluxo
**pré-visualizar → rever → confirmar**.

- Quem preenche **só edita a folha**; nunca vê CSV, links nem o Supabase.
- Um **administrador autenticado** revê o resumo (*"X níveis, Y perguntas"*, com aviso das linhas
  ignoradas) e só depois confirma a gravação.

## Alternativas consideradas

- **Botão dentro da própria Google Sheet (Apps Script):** mais próximo do "escrevem e aparece",
  mas exigia um segredo/token na folha e não tinha momento de revisão. Rejeitado por auditoria.
- **Sincronização automática (agendada):** máxima simplicidade, mas **sem travão** — uma linha a
  meio iria para a app. Rejeitado por auditoria.
- Escolhida a opção **com revisão no admin** por dar controlo e a melhor história de auditoria.

## Segurança da importação

- A gravação passa pela RPC `sincronizar_conteudo(p_niveis jsonb, p_questoes jsonb)`,
  `SECURITY DEFINER`, **restrita a administradores** (`IF NOT is_admin() THEN RAISE`).
- A RPC faz **UPSERT por `id`** (`ON CONFLICT (id) DO UPDATE`): **nunca apaga**. Uma folha mal
  editada ou truncada não destrói conteúdo nem o histórico de respostas.
- Validação em duas camadas: no **cliente** (parser CSV robusto, ignora e reporta linhas
  inválidas — `id`/`id_niveis` não numéricos, `opcao_correta` fora de 1–3, campos em falta) e no
  **servidor** (a RPC só aceita dois arrays JSON e ignora o resto).
- O CSV publicado contém **apenas conteúdo do quiz** — **nenhum dado pessoal**.

## Modelo "nunca repetir" (never-repeat) e percurso

- Cada beneficiário só vê cada pergunta **uma vez**. Registo em `respostas_dadas`
  (`numbeneficiario`, `id_questao`, `correta`, `respondida_em`), PK composta, `ON DELETE CASCADE`
  para `Utilizadores` e `quiz_questoes` (limpeza automática — RGPD-friendly).
- `obter_perguntas_do_nivel(pin, nivel)` sorteia `num_perguntas` do nível **excluindo** as já
  respondidas; quando esgota, devolve vazio (ecrã "concluído").
- `registar_tentativa(pin, id_nivel, nivel_nome, respostas jsonb)` marca as respondidas **e** grava
  o resultado numa só transação; a correção é feita **no servidor** (compara com `opcao_correta`).
- **Percurso aberto:** todos os níveis estão disponíveis desde o início; não há desbloqueio por
  resultado. A coluna `niveis.ordem` serve só para ordenar a lista.

## Consequências

- Toda a leitura de conteúdo passa a ser por RPC `SECURITY DEFINER`; a app deixou de ler tabelas
  diretamente (exceção do padrão de segurança fechada).
- Manutenção de conteúdo deixa de precisar de intervenção técnica no Supabase.
- Fica registado que o "botão dentro da folha" e a "sincronização automática" foram
  **conscientemente descartados** por não terem revisão.
