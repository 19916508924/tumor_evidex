export function equivalentProteinVariantTerms(normalizedTerm: string) {
  return [
    ...new Set([
      normalizedTerm,
      ...(normalizedTerm.startsWith('p.') ? [normalizedTerm.slice(2)] : []),
    ]),
  ];
}
