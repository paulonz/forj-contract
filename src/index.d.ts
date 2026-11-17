// src/index.d.ts
//
// Tipagem mínima para consumidores TypeScript (ex: services/app-registry).
// Mantida manualmente, em paralelo ao JS puro de index.mjs — este pacote
// não usa um compilador TS próprio (ver README/package.json: `type:
// module`, scripts só de validação), então os tipos são escritos à mão,
// não gerados.
export interface ManifestValidationError {
  path: string;
  message: string;
  params: Record<string, unknown>;
}

export type ManifestValidationResult =
  | { valid: true }
  | { valid: false; errors: ManifestValidationError[] };

export declare const schema: Record<string, unknown>;

export declare function validateManifest(manifest: unknown): ManifestValidationResult;
