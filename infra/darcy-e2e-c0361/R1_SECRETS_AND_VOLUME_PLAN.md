# R1 — segredos protegidos e nova identidade de volume

## Decisão

O volume `darcy-e2e-c0361_db` permanece preservado e não será selecionado
automaticamente. A próxima stack planejada tem identidade própria:

- Compose: `darcy-e2e-c0361-r1`
- Rede: `darcy-e2e-c0361-r1_network`
- Volume: `darcy-e2e-c0361-r1_db`

A criação operacional dessa stack e a aplicação de migrations exigem autorizações
separadas. A troca de nomes não deve apontar silenciosamente para o volume antigo.

## Segredos necessários

O Compose exige somente:

- `DARCY_E2E_POSTGRES_PASSWORD`
- `DARCY_E2E_JWT_SECRET`

Os valores devem ser exclusivos da stack R1, estáveis entre reinicializações e
armazenados fora do Git. Nenhum valor deve ser gerado automaticamente durante uma
retomada de volume existente.

## Armazenamento recomendado

Preferir um item dedicado no Keychain do macOS por identidade de stack. O launcher
futuro deverá recuperar os valores somente em memória, dentro do processo
autorizado, sem passá-los em argumentos de linha de comando, logs ou mensagens de
erro. A integração real com Keychain não é implementada neste documento nem nesta
etapa; nenhum item real é consultado ou criado.

Se o Keychain não estiver disponível para o processo autorizado, a alternativa
deverá ser um arquivo fora do repositório, em diretório exclusivo do usuário,
proprietário correto, modo `0600`, sem symlink e com escrita atômica. Esse fallback
precisa ser escolhido explicitamente e nunca silenciosamente.

## Contrato local

`src/config/darcyE2eSecretStore.ts` valida a identidade R1, os dois nomes
obrigatórios, a ausência de placeholders, o modo `new`/`resume` e a identidade do
volume. A leitura é injetada por uma interface; o módulo não acessa Keychain,
filesystem, Docker, banco ou serviços remotos.

O módulo também valida metadados de um eventual arquivo protegido (proprietário,
permissões e symlink), sem ler seu conteúdo, e nunca fornece
`DARCY_E2E_LOCAL_OPERATIONAL_VERIFIED`.

## Integração futura

1. Vincular o resolver a um backend de segredos explicitamente escolhido.
2. Validar a identidade R1 antes de montar qualquer configuração Compose.
3. Rejeitar segredos ausentes, placeholders ou identidade divergente.
4. Iniciar somente a stack R1 após os guards Docker do launcher.
5. Fornecer o marcador operacional somente após a comprovação dos containers.
6. Manter migrations, contas e testes remotos em autorizações independentes.

O sucesso do resolver de segredos não comprova a propriedade do Docker, do volume
ou do Auth; essas verificações continuam pertencendo ao launcher operacional.
