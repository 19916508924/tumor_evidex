/**
 * @param {{ sourceHash: string, diagnostics: string[] } | undefined} entry
 * @param {string} sourceHash
 * @param {string} diagnostic
 */
export function isKnownDiagnostic(entry, sourceHash, diagnostic) {
  return Boolean(
    entry &&
      entry.sourceHash === sourceHash &&
      entry.diagnostics.includes(diagnostic)
  );
}
