// src/index.mjs
//
// Entry point público do pacote `forj-contract`, consumido por serviços do
// shell (ex: services/app-registry, f4-02/issue #35) como DEPENDÊNCIA
// NORMAL (workspace/file:), nunca via fetch HTTP nem cópia manual do
// schema — ver README.md "Fora de escopo" e a issue #35/AC-14. Reaproveita
// a MESMA lógica Ajv já demonstrada em scripts/validate.mjs (nenhuma 2ª
// implementação divergente do validador).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

/** Schema JSON bruto (forj.schema.json) — exportado para quem precisar
 * inspecionar o contrato diretamente (ex: geração de documentação), mas o
 * caminho recomendado de validação é `validateManifest()` abaixo. */
export const schema = JSON.parse(
  readFileSync(path.join(root, "schema", "forj.schema.json"), "utf8"),
);

let compiledValidate;
function getValidator() {
  if (!compiledValidate) {
    const ajv = new Ajv({ allErrors: true, strict: true });
    addFormats(ajv);
    compiledValidate = ajv.compile(schema);
  }
  return compiledValidate;
}

/**
 * @typedef {{ path: string, message: string, params: object }} ManifestValidationError
 */

/**
 * Valida um manifesto `forj.yaml` já parseado (objeto JS, YAML ou JSON
 * tanto faz — quem chama decide o parser) contra o schema estrutural da
 * f4-01. Nunca faz I/O de rede, nunca lê um schema diferente do
 * empacotado em `schema/forj.schema.json` desta MESMA versão do pacote.
 *
 * @param {unknown} manifest
 * @returns {{ valid: true } | { valid: false, errors: ManifestValidationError[] }}
 */
export function validateManifest(manifest) {
  const validate = getValidator();
  const valid = validate(manifest);
  if (valid) {
    return { valid: true };
  }
  const errors = (validate.errors ?? []).map((err) => ({
    path: err.instancePath || "(root)",
    message: err.message ?? "validation error",
    params: err.params,
  }));
  return { valid: false, errors };
}
