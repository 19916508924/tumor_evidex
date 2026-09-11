/** @param {{ status: string, path: string }[]} changes */
export function evaluateTestPolicy(changes) {
  const sourceFiles = changes
    .filter(
      ({ path }) =>
        /^src\/.*\.(?:[cm]?[jt]sx?)$/.test(path) && !path.endsWith('.d.ts')
    )
    .map(({ path }) => path);
  const testFiles = changes
    .filter(
      ({ status, path }) =>
        status !== 'D' && /^tests\/.*\.(?:test|spec)\.[jt]sx?$/.test(path)
    )
    .map(({ path }) => path);
  return {
    ok: sourceFiles.length === 0 || testFiles.length > 0,
    sourceFiles,
    testFiles,
  };
}
