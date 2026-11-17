# forj-contract

Contrato formal do manifesto de microapp (`forj.yaml`) da plataforma **Forj**.

Este repositório existe separado de `paulonz/forj` (o shell, fechado/fonte nunca liberado) **de propósito**: qualquer partner/dev que constrói um microapp para a plataforma precisa ler este schema e estes exemplos para preencher seu próprio `forj.yaml` corretamente, sem precisar (e sem ter) acesso ao código do shell.

**Acesso**: repositório público no GitHub. Decisão tomada neste trabalho (issue `paulonz/forj#34`): como o AC não prescreve o mecanismo exato ("repo público, ou privado com colaboradores de leitura, são ambos aceitáveis" — cabe à implementação escolher o mais simples de operar), optamos por **público** porque (a) o conteúdo é só um contrato estrutural + exemplos + validador, sem segredo de negócio, (b) manter leitura liberada "aos partners/devs" via repo privado exigiria gerenciar convites/colaboradores para cada partner — overhead operacional desnecessário para um artefato que é, por definição, destinado a ser lido por terceiros externos à empresa, (c) nada aqui vaza arquitetura interna sensível do shell (que permanece fechado em outro repositório).

## Nota de nomenclatura — "manifesto do app" vs "manifesto Kubernetes"

O termo **"manifesto"** usado aqui (`forj.yaml`, este repositório) é **completamente distinto** dos **"manifestos Kubernetes"** (YAML de `Deployment`/`Service` via Kustomize, repositório `forj-deployments`, nunca visto por partners). Mesma palavra, dois artefatos sem relação:

| | `forj.yaml` ("manifesto do app") | Manifestos Kubernetes |
|---|---|---|
| Repositório | **`forj-contract`** (este, + o `forj.yaml` na raiz de cada microapp) | `forj-deployments` |
| Quem lê | Partners/devs que constroem microapps + API de registro (f4-02) | Argo CD + a Forj internamente |
| Conteúdo | Versão do contrato, slug do app, rotas, claims, dependências, plugins de UI | `Deployment`, `Service`, `NetworkPolicy`, etc. |
| Visibilidade | Público (este repo) | Fechado, nunca liberado |

Ver também `paulonz/forj/README.md` (seção "Fluxo de construção, deploy e versionamento de microapp") e `paulonz/forj/docs/forj-manifest-schema.md`, que fazem a mesma distinção e apontam para cá.

## Campos do schema (`schema/forj.schema.json`)

| Campo | Tipo | Obrigatório | Descrição | Nota de fronteira |
|---|---|---|---|---|
| `forjVersion` | `string` | ✅ | Versão do contrato que este manifesto segue. | **Este schema NÃO usa `const`/`enum` para travar num único valor aceito.** Fazer isso exigiria editar o schema (e publicar uma nova versão deste repo) a cada bump de versão suportada, mesmo que o *formato* do campo nunca mude. A política "só a versão mais recente é aceita, rejeita desatualizado" é enforcement em **runtime**, feito por **f4-02** (API de registro) — não por este schema. |
| `name` | `string` | ✅ | Nome/slug do app. Regex `^[a-z0-9]+(-[a-z0-9]+)*$` (minúsculas, números, hífen). | Usado como identificador do microapp na plataforma (path de rota, nome do Deployment `forj-app-<name>`, etc). |
| `repoUrl` | `string` (`format: uri`) | ✅ | URL do repositório fonte do microapp. | Deve apontar para um repositório CLONÁVEL (raiz do repo, não página `/tree/...`). Permite a f4-02 (registro) e f4-05 (SAST/scan de dependências) localizarem o código e o `package.json`/lockfile. |
| `repoSubdir` | `string` | opcional | Subcaminho DENTRO do repositório apontado por `repoUrl` onde o microapp vive. | Use quando o app estiver num monorepo (ex.: `apps/tarefas`). Omitir significa "o microapp está na raiz do repo". |
| `routes` | `array<object>` | opcional (default `[]`) | Registro estático de rotas expostas, cada uma com `path` (obrigatório) e `publica` (booleano). | Ver seção "Default de `publica`" abaixo — **importante**. Não descreve workflow hypermedia em runtime (isso é decidido pela API a cada resposta, f3-07). |
| `requiredJwtClaims` | `array<string>` | opcional (default `[]`) | Claims JWT que o microapp espera consumir (ex: `tenant_id`, `roles`). | **Este schema só valida que é uma lista de strings.** NÃO valida os valores contra a whitelist real de claims emitidas pelo auth (`tenant_id`, `partner_id`, `apps`, `roles`, `is_tenant_admin`, `tier`) — essa validação de **valor** é job de **f4-05**, fora de escopo aqui. |
| `appDependencies` | `array<string>` | opcional (default `[]`) | Slugs de **outros microapps Forj** dos quais este depende para funcionar (ex: `vendas`). | **NÃO é lista de pacotes npm.** Dependências npm vêm do `package.json`/lockfile do repositório apontado por `repoUrl`, escaneadas por f4-05. Os dois conceitos usam a palavra "dependência" mas são coisas diferentes — não confundir. |
| `uiPlugins` | `array` | opcional (default `[]`) | Placeholder genérico/forward-compatible para plugins de UI customizada (escape hatch da Fase 3, f3-08 — já fechada/mergeada). | Mantido **deliberadamente genérico** (itens sem schema fixo). Uma entrada aqui mapeia conceitualmente para um *remote name* de Module Federation, mas este schema **não** trava a forma interna exata de f3-08 — o gate que vai de fato consumir/validar este campo (**f4-07**) ainda não foi desenhado. Travar a forma agora forçaria retrabalho quando f4-07 for construído. |

### Default de `publica` — fail-safe, e por que `default` no JSON Schema não basta sozinho

O campo `routes[].publica` declara `"default": false` na definição JSON Schema — isso **documenta a intenção** (rota sem o campo é tratada como protegida, fail-safe/fail-closed) mas **`default` no JSON Schema é documentação para a maioria dos validadores (incluindo Ajv por padrão)**: ele **não injeta** o valor no objeto parseado sozinho.

Duas formas de aplicar o default de fato, demonstradas em `scripts/validate.mjs`:

1. **Padrão de código recomendado para consumidores** (gateway, gate f4-04, etc): sempre ler o campo com fallback explícito:
   ```js
   const effectivePublica = route.publica ?? false;
   ```
2. **Opção de ferramenta**: Ajv com `useDefaults: true` (`new Ajv({ useDefaults: true })`) faz o próprio Ajv **mutar o objeto validado**, injetando `publica: false` em toda rota que não o declarou, durante a validação.

Qualquer consumidor futuro deste schema (f4-02, f4-04) deve escolher uma das duas abordagens explicitamente — nunca assumir que o campo já vem preenchido.

## Exemplos

- `examples/valid-forj.yaml` — microapp fictício "relatorios", todos os campos obrigatórios preenchidos. Inclui:
  - uma rota com `publica: true` (`/health`)
  - uma rota **sem** o campo `publica` (`/relatorios/:id`) — demonstra o cenário de fail-safe default
- `repoSubdir` é opcional e fica ausente no exemplo válido porque ele representa o caso simples: microapp na raiz do próprio repositório. Em monorepo, use `repoUrl` para a raiz cloneável do repo e `repoSubdir` para o caminho interno do app.
- `examples/invalid-forj.yaml` — falta o campo obrigatório `repoUrl` de propósito, para demonstrar que o validador rejeita com um erro específico (não um erro genérico de parse).

## Como rodar o validador localmente

```bash
npm install
npm run validate
```

O script (`scripts/validate.mjs`, usa [Ajv](https://ajv.js.org/) + [ajv-formats](https://github.com/ajv-validator/ajv-formats) + [js-yaml](https://github.com/nodejs/node-yaml) — leitor de YAML porque os exemplos são `.yaml`) faz:

1. Valida `examples/valid-forj.yaml` → espera **0 erros**.
2. Valida `examples/invalid-forj.yaml` → espera erro específico apontando o campo faltante (`repoUrl`).
3. Demonstra o fail-safe default de `publica`: imprime o objeto bruto parseado (sem o campo, quando omitido) e depois o valor efetivo aplicando `route.publica ?? false`, e também o resultado alternativo usando Ajv `useDefaults: true`.

Saída real obtida ao escrever este repositório (colada também na PR de referência em `paulonz/forj`):

```
=== examples/valid-forj.yaml ===
Result: VALID — 0 errors

=== examples/invalid-forj.yaml ===
Result: INVALID — 1 error(s):
  - path: "(root)" | must have required property 'repoUrl' | params: {"missingProperty":"repoUrl"}

=== publica fail-safe default demonstration (examples/valid-forj.yaml routes) ===
Raw parsed routes (note: route without `publica` key has NO `publica` property at all —
JSON Schema's `default` keyword does NOT auto-inject a value into parsed YAML/JSON):
  {"path":"/health","publica":true}
  {"path":"/relatorios","publica":false}
  {"path":"/relatorios/:id"}

Applying the documented consumer pattern `route.publica ?? false`:
  path=/health          declared.publica=true      => effective publica=true
  path=/relatorios      declared.publica=false     => effective publica=false
  path=/relatorios/:id  declared.publica=undefined => effective publica=false

Alternative: Ajv `useDefaults: true` mutates the parsed object directly:
  {"path":"/health","publica":true}
  {"path":"/relatorios","publica":false}
  {"path":"/relatorios/:id","publica":false}

=== Summary ===
valid-forj.yaml validated with 0 errors: true
invalid-forj.yaml correctly rejected: true
```

## Fora de escopo deste repositório (explícito, para não virar dívida confundida)

- Credenciais/strings de conexão de banco no manifesto — infraestrutura de deploy (Fase 5), não contrato.
- Enforcement em runtime de versão única suportada de `forjVersion` — job de **f4-02**.
- Validação de **valores** de `requiredJwtClaims` contra a whitelist real de claims — job de **f4-05**.
- Re-validação em tempo de deploy (Kustomize/Fase 5) — a validação acontece só no registro (f4-02), antes de qualquer deploy.
- Suporte formal a múltiplas versões coexistentes de `forjVersion` — só quando houver demanda real de um partner (issue futura).
- API de registro em si (f4-02) — este repositório só contém o contrato/schema, não o serviço que o consome.
- Gate de SAST/dependências (f4-05) — consome `repoUrl`, mas vive em outro lugar.
- Normalização de URLs web de provedor Git (ex.: converter automaticamente `/tree/...` em clone URL) — fora de escopo. O contrato correto é `repoUrl` cloneável + `repoSubdir` opcional.
- Forma interna definitiva de `uiPlugins` (aguardando f4-07).

## Para partners/devs: como usar este repositório

1. Leia `schema/forj.schema.json` e este README para entender cada campo.
2. Copie a estrutura de `examples/valid-forj.yaml` como ponto de partida para o `forj.yaml` do seu microapp.
3. Rode `npm install && npm run validate` (ou aponte seu próprio validador JSON Schema para `schema/forj.schema.json`) antes de submeter seu manifesto para registro na plataforma.
4. Lembre-se: este schema valida **estrutura**, não valores de negócio (claims reais emitidas, versão aceita no momento, dependências npm) — essas checagens acontecem em outros gates da plataforma no momento do registro (f4-02) e do CI (f4-05).
