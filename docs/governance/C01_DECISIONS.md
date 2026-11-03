# DARCY — Registro de decisões do ciclo C01

## D-2026-10-30-01 — Comandos explícitos para marcos

- Tarefa: C01-T3 / D4.2
- Decisão: manter o PUT como autosave e usar comandos POST autenticados para
  aprovação de seção e consolidação.
- Justificativa: a intenção de marco não pode ser inferida de um JSON genérico.
- Alternativa rejeitada: criar versão sempre que o autosave alterar status ou
  texto.
- Consequência: o frontend precisará chamar o comando após autosave confirmado.

## D-2026-10-30-02 — Texto persistido antes do marco

- Tarefa: C01-T3 / D4.2
- Decisão: aprovação e consolidação exigem texto previamente persistido; não
  transformam o primeiro snapshot recebido em marco.
- Justificativa: evita certificar como marco um conteúdo nunca confirmado no
  estado do projeto.
- Consequência: projetos legados devem passar por autosave antes do comando.

## D-2026-10-30-03 — Proveniência de IA adiada

- Tarefa: C01-T3 / D4.2
- Decisão: não registrar origem `ia_assistida` para geração/regeneração nesta
  etapa.
- Justificativa: o backend ainda não comprova a cadeia entre resposta do
  provedor e persistência posterior.
- Consequência: a integração de IA exige contrato próprio em etapa posterior.

## D-2026-10-30-04 — Governança proposta local

- Tarefa: C01-T2
- Decisão: manter documentos mestres canônicos no backend em
  `docs/governance/`, referenciados pelo frontend.
- Justificativa: evitar dois backlogs oficiais ou instruções divergentes.
- Consequência: a governança permanece proposta até revisão humana explícita.

## D-2026-10-30-05 — Aprovação concentrada por ciclo

- Tarefa: C01-T6
- Decisão: reunir commits locais tecnicamente validados em uma proposta única
  de publicação ao final do ciclo, separando repositório, branch e conjunto de
  commits.
- Justificativa: reduzir aprovações fragmentadas sem ampliar autorização.
- Consequência: nenhum push ocorre antes da aprovação humana explícita do
  relatório consolidado.

## D-2026-10-30-06 — Estados independentes de publicação

- Tarefa: C01-T6
- Decisão: registrar separadamente validação local, aprovação humana, publicação
  no GitHub, resultado do CI e validação E2E.
- Justificativa: conclusão local não equivale a homologação ou publicação.
- Consequência: cada gate permanece pendente até sua própria evidência.

## D-2026-10-30-07 — Retomada baseada em evidência

- Tarefa: C01-T1 / C01-T6
- Decisão: toda sessão inicia comparando backlog, commits e worktrees reais.
- Justificativa: impedir repetição de implementações e detectar divergências
  entre documentação e código.
- Consequência: conflitos documentais são registrados antes de continuar.

## D-2026-10-30-08 — Gate de regressões críticas

- Tarefa: C01-T6
- Decisão: falhas de autenticação, ownership, concorrência ou persistência
  bloqueiam publicação de alterações dependentes.
- Justificativa: são riscos diretamente relacionados à segurança e integridade
  dos dados.
- Consequência: a tarefa é corrigida no escopo autorizado ou marcada como
  bloqueada, sem contornar guards.

## D-2026-11-01-09 — Publicação controlada do C01

- Tarefa: C01-T6
- Decisão: publicar exclusivamente os conjuntos aprovados nas branches
  `desenvolvimento/maturacao-darcy` dos dois repositórios.
- Evidência: backend em `48bd69e`; frontend em `57f185f`; Backend CI #24
  aprovado; CI do frontend não verificável pelo endpoint público consultado.
- Consequência: a publicação do C01 está registrada como concluída; a
  validação E2E permanece um estado independente e pendente.

## D-2026-11-03-10 — Listagem sem conteúdo integral

- Tarefa: C03-T2
- Decisão: a listagem de versões retorna somente metadados; o texto integral
  exige consulta autenticada de uma versão específica.
- Justificativa: reduzir exposição acidental e manter respostas paginadas
  leves, sem substituir a autorização por uma relação Prisma.
- Consequência: a UI busca o conteúdo apenas das duas versões selecionadas.

## D-2026-11-03-11 — Histórico real opt-in

- Tarefa: C03-T3 / C03-T4
- Decisão: a tela real só é ativada para projetos `resumo-academico` quando
  `VITE_RESUMO_HISTORY_ENABLED=enabled`; o exemplo local usa `disabled`.
- Justificativa: preservar o fluxo demonstrativo e evitar exposição prematura
  no Alpha até concluir a validação E2E.
- Consequência: a ausência da flag não altera o comportamento anterior.

## D-2026-11-03-12 — Comparação sem restauração

- Tarefa: C03-T4
- Decisão: a comparação é somente leitura; não oferece edição, merge ou
  restauração de versões.
- Justificativa: restauração exige comando autenticado, `expectedRevision`,
  nova versão e evento transacional, reservados ao C04.
- Consequência: nenhum estado persistido é alterado pela tela comparativa.

## D-2026-11-03-13 — E2E remoto como gate independente

- Tarefa: C03-T5
- Decisão: testes locais aprovados não promovem automaticamente o estado para
  homologado ou publicado; C03 precisa de E2E específico após autorização.
- Justificativa: ownership, paginação real e payloads de conteúdo dependem de
  PostgreSQL/Auth E2E e não foram escritos nesta ativação.
- Consequência: commits permanecem locais e push aguarda aprovação humana.
