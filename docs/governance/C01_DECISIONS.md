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
