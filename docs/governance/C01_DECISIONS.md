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
