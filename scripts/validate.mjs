// scripts/validate.mjs
//
// Small demonstration/CI-ready validator for forj.yaml against the
// forj-contract JSON Schema. Run with: npm run validate
//
// What it does:
//   1. Validates examples/valid-forj.yaml against schema/forj.schema.json
//      -> expects 0 errors.
//   2. Validates examples/invalid-forj.yaml against the same schema
//      -> expects >=1 error, specifically identifying the missing required
//         field (not a generic parse failure).
//   3. Demonstrates the `publica` fail-safe default: JSON Schema's `default`
//      keyword is documentation-only for Ajv unless you pass `useDefaults`.
//      This script shows BOTH:
//        a) the raw parsed route object (no `publica` key at all when omitted)
//        b) the safe way a consumer should read it: `route.publica ?? false`
//      and separately re-validates with Ajv's `useDefaults: true` to show
//      Ajv itself can inject the default into the parsed data if desired.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const schema = JSON.parse(
  readFileSync(path.join(root, "schema", "forj.schema.json"), "utf8")
);

function loadYaml(relPath) {
  return yaml.load(readFileSync(path.join(root, relPath), "utf8"));
}

function printResult(label, valid, errors) {
  console.log(`\n=== ${label} ===`);
  if (valid) {
    console.log("Result: VALID — 0 errors");
  } else {
    console.log(`Result: INVALID — ${errors.length} error(s):`);
    for (const err of errors) {
      console.log(`  - path: "${err.instancePath || "(root)"}" | ${err.message} | params: ${JSON.stringify(err.params)}`);
    }
  }
}

// --- 1 & 2: structural validation (no useDefaults, matches plain schema semantics) ---
const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);

const validDoc = loadYaml("examples/valid-forj.yaml");
const validOk = validate(validDoc);
printResult("examples/valid-forj.yaml", validOk, validate.errors || []);

const invalidDoc = loadYaml("examples/invalid-forj.yaml");
const invalidOk = validate(invalidDoc);
printResult("examples/invalid-forj.yaml", invalidOk, validate.errors || []);

// --- 3: publica fail-safe default demonstration ---
console.log("\n=== publica fail-safe default demonstration (examples/valid-forj.yaml routes) ===");
console.log("Raw parsed routes (note: route without `publica` key has NO `publica` property at all —");
console.log("JSON Schema's `default` keyword does NOT auto-inject a value into parsed YAML/JSON):");
for (const route of validDoc.routes) {
  console.log(`  ${JSON.stringify(route)}`);
}

console.log("\nApplying the documented consumer pattern `route.publica ?? false`:");
for (const route of validDoc.routes) {
  const effectivePublica = route.publica ?? false;
  console.log(`  path=${route.path.padEnd(16)} declared.publica=${String(route.publica).padEnd(9)} => effective publica=${effectivePublica}`);
}

// Also demonstrate Ajv's useDefaults as an alternative mechanism that DOES mutate the parsed object.
console.log("\nAlternative: Ajv `useDefaults: true` mutates the parsed object directly:");
const ajvWithDefaults = new Ajv({ allErrors: true, strict: true, useDefaults: true });
addFormats(ajvWithDefaults);
const validateWithDefaults = ajvWithDefaults.compile(schema);
const validDocForDefaults = loadYaml("examples/valid-forj.yaml"); // fresh parse, mutated in place below
validateWithDefaults(validDocForDefaults);
for (const route of validDocForDefaults.routes) {
  console.log(`  ${JSON.stringify(route)}`);
}

// --- Exit code reflects whether the expected pass/fail outcomes happened ---
const expectationsMet = validOk === true && invalidOk === false;
console.log(`\n=== Summary ===`);
console.log(`valid-forj.yaml validated with 0 errors: ${validOk}`);
console.log(`invalid-forj.yaml correctly rejected: ${!invalidOk}`);
process.exit(expectationsMet ? 0 : 1);
