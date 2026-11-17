# forj-contract

Formal contract of the microapp manifest (`forj.yaml`) for the **Forj** platform.

This repository exists separate from `paulonz/forj` (the shell, closed-source, never released) **on purpose**: any partner/dev building a microapp for the platform needs to read this schema and these examples to correctly fill out their own `forj.yaml`, without needing (and without having) access to the shell's code.

**Access**: public repository on GitHub. Decision made in this work (issue `paulonz/forj#34`): since the AC does not prescribe the exact mechanism ("public repo, or private with read collaborators, are both acceptable" — it is up to the implementation to choose the simplest to operate), we chose **public** because (a) the content is just a structural contract + examples + validator, with no business secret, (b) keeping read access open "to partners/devs" via a private repo would require managing invitations/collaborators for every partner — unnecessary operational overhead for an artifact that is, by definition, meant to be read by parties external to the company, (c) nothing here leaks sensitive internal shell architecture (which remains closed in another repository).

## Naming note — "app manifest" vs "Kubernetes manifest"

The term **"manifest"** used here (`forj.yaml`, this repository) is **completely distinct** from **"Kubernetes manifests"** (YAML for `Deployment`/`Service` via Kustomize, `forj-deployments` repository, never seen by partners). Same word, two unrelated artifacts:

| | `forj.yaml` ("app manifest") | Kubernetes manifests |
|---|---|---|
| Repository | **`forj-contract`** (this one, + the `forj.yaml` at the root of each microapp) | `forj-deployments` |
| Who reads it | Partners/devs building microapps + the registration API (f4-02) | Argo CD + Forj internally |
| Content | Contract version, app slug, routes, claims, dependencies, UI plugins | `Deployment`, `Service`, `NetworkPolicy`, etc. |
| Visibility | Public (this repo) | Closed, never released |

See also `paulonz/forj/README.md` (section "Microapp build, deploy, and versioning flow") and `paulonz/forj/docs/forj-manifest-schema.md`, which draw the same distinction and point here.

## Schema fields (`schema/forj.schema.json`)

| Field | Type | Required | Description | Boundary note |
|---|---|---|---|---|
| `forjVersion` | `string` | ✅ | Version of the contract this manifest follows. | **This schema does NOT use `const`/`enum` to lock it to a single accepted value.** Doing so would require editing the schema (and publishing a new version of this repo) on every bump of the supported version, even though the field's *format* never changes. The policy "only the latest version is accepted, reject outdated" is enforced at **runtime**, done by **f4-02** (registration API) — not by this schema. |
| `name` | `string` | ✅ | App name/slug. Regex `^[a-z0-9]+(-[a-z0-9]+)*$` (lowercase, numbers, hyphen). | Used as the microapp's identifier on the platform (route path, `Deployment` name `forj-app-<name>`, etc). |
| `repoUrl` | `string` (`format: uri`) | ✅ | URL of the microapp's source repository. | Must point to a CLONABLE repository (repo root, not a `/tree/...` page). Allows f4-02 (registration) and f4-05 (SAST/dependency scan) to locate the code and the `package.json`/lockfile. |
| `repoSubdir` | `string` | optional | Subpath INSIDE the repository pointed to by `repoUrl` where the microapp lives. | Use when the app is in a monorepo (e.g., `apps/tarefas`). Omitting it means "the microapp is at the repo root". |
| `routes` | `array<object>` | optional (default `[]`) | Static registry of exposed routes, each with `path` (required) and `publica` (boolean). | See the "`publica` default" section below — **important**. Does not describe hypermedia workflow at runtime (that is decided by the API on every response, f3-07). |
| `requiredJwtClaims` | `array<string>` | optional (default `[]`) | JWT claims the microapp expects to consume (e.g., `tenant_id`, `roles`). | **This schema only validates that it is a list of strings.** It does NOT validate the values against the real whitelist of claims issued by auth (`tenant_id`, `partner_id`, `apps`, `roles`, `is_tenant_admin`, `tier`) — that **value** validation is the job of **f4-05**, out of scope here. |
| `appDependencies` | `array<string>` | optional (default `[]`) | Slugs of **other Forj microapps** this one depends on to function (e.g., `vendas`). | **NOT a list of npm packages.** npm dependencies come from the `package.json`/lockfile of the repository pointed to by `repoUrl`, scanned by f4-05. The two concepts use the word "dependency" but are different things — do not confuse them. |
| `uiPlugins` | `array` | optional (default `[]`) | Generic/forward-compatible placeholder for custom UI plugins (Phase 3 escape hatch, f3-08 — already closed/merged). | Kept **deliberately generic** (items with no fixed schema). An entry here conceptually maps to a Module Federation *remote name*, but this schema does **not** lock down the exact internal shape from f3-08 — the gate that will actually consume/validate this field (**f4-07**) has not been designed yet. Locking the shape now would force rework when f4-07 is built. |

### `publica` default — fail-safe, and why JSON Schema's `default` is not enough on its own

The `routes[].publica` field declares `"default": false` in its JSON Schema definition — this **documents the intent** (a route without the field is treated as protected, fail-safe/fail-closed) but **`default` in JSON Schema is documentation for most validators (including Ajv by default)**: it does **not inject** the value into the parsed object on its own.

Two ways to actually apply the default, demonstrated in `scripts/validate.mjs`:

1. **Recommended code pattern for consumers** (gateway, gate f4-04, etc): always read the field with an explicit fallback:
   ```js
   const effectivePublica = route.publica ?? false;
   ```
2. **Tooling option**: Ajv with `useDefaults: true` (`new Ajv({ useDefaults: true })`) makes Ajv itself **mutate the validated object**, injecting `publica: false` into every route that did not declare it, during validation.

Any future consumer of this schema (f4-02, f4-04) must explicitly choose one of the two approaches — never assume the field already comes filled in.

## Examples

- `examples/valid-forj.yaml` — fictitious microapp "relatorios", all required fields filled in. Includes:
  - a route with `publica: true` (`/health`)
  - a route **without** the `publica` field (`/relatorios/:id`) — demonstrates the fail-safe default scenario
- `repoSubdir` is optional and absent in the valid example because it represents the simple case: microapp at the root of its own repository. In a monorepo, use `repoUrl` for the clonable repo root and `repoSubdir` for the app's internal path.
- `examples/invalid-forj.yaml` — intentionally missing the required `repoUrl` field, to demonstrate that the validator rejects it with a specific error (not a generic parse error).

## How to run the validator locally

```bash
npm install
npm run validate
```

The script (`scripts/validate.mjs`, uses [Ajv](https://ajv.js.org/) + [ajv-formats](https://github.com/ajv-validator/ajv-formats) + [js-yaml](https://github.com/nodejs/node-yaml) — YAML reader because the examples are `.yaml`) does:

1. Validates `examples/valid-forj.yaml` → expects **0 errors**.
2. Validates `examples/invalid-forj.yaml` → expects a specific error pointing at the missing field (`repoUrl`).
3. Demonstrates the fail-safe default of `publica`: prints the raw parsed object (without the field, when omitted) and then the effective value applying `route.publica ?? false`, and also the alternative result using Ajv `useDefaults: true`.

Real output obtained while writing this repository (also pasted in the reference PR at `paulonz/forj`):

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

## Out of scope for this repository (explicit, to avoid confused tech debt)

- Database connection credentials/strings in the manifest — deploy infrastructure (Phase 5), not contract.
- Runtime enforcement of a single supported `forjVersion` — job of **f4-02**.
- Validation of **values** of `requiredJwtClaims` against the real claims whitelist — job of **f4-05**.
- Re-validation at deploy time (Kustomize/Phase 5) — validation only happens at registration (f4-02), before any deploy.
- Formal support for multiple coexisting `forjVersion` versions — only when there is real demand from a partner (future issue).
- The registration API itself (f4-02) — this repository only contains the contract/schema, not the service that consumes it.
- SAST/dependency gate (f4-05) — consumes `repoUrl`, but lives elsewhere.
- Normalization of web Git provider URLs (e.g., automatically converting `/tree/...` into a clone URL) — out of scope. The correct contract is a clonable `repoUrl` + optional `repoSubdir`.
- Final internal shape of `uiPlugins` (pending f4-07).

## Siren format (hypermedia actions) — what your microapp must return

This is not part of `forj.yaml` (which is just the static manifest of routes/claims/dependencies), but it is the **runtime** contract your API must follow in responses that expose workflow state — same description used in the microapp-builder skill (`skills/forj-microapp-builder/SKILL.md`, section 3, `paulonz/forj` repository), reused here so the two sources do not diverge.

Every response that exposes workflow state includes an `actions[]` array; each action has `name`, `href`, `method`, and `fields` (array, empty when the action does not require a form). `href`/`method` are used **literally** by whoever consumes the response — they are never reconstructed or guessed from other information.

Technical example (shape of the actions, not a full resource payload):

```json
{
  "actions": [
    { "name": "iniciar", "href": "/tarefas/123/iniciar", "method": "POST", "fields": [] }
  ]
}
```

Rules: an action unavailable in the current state responds with **409** and does not appear in `actions[]`; terminal state = `actions` array always empty; `fields: []` (empty array, not absent) is the convention for a "one-click action with no form".

## For partners/devs: how to use this repository

1. Read `schema/forj.schema.json` and this README to understand each field.
2. Copy the structure of `examples/valid-forj.yaml` as a starting point for your microapp's `forj.yaml`.
3. Run `npm install && npm run validate` (or point your own JSON Schema validator at `schema/forj.schema.json`) before submitting your manifest for registration on the platform.
4. Remember: this schema validates **structure**, not business values (actual issued claims, currently accepted version, npm dependencies) — those checks happen at other platform gates at registration time (f4-02) and in CI (f4-05).
