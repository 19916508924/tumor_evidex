export const EVIDEX_DEMO_REVIEWER = Object.freeze({
  id: 'demo-reviewer',
  email: 'demo-reviewer@evidex.local',
  name: 'Evidex 演示审核员',
  role: 'REVIEWER' as const,
});

export function isEvidexDemoMode(
  environment: Record<string, string | undefined> = process.env
) {
  return environment.EVIDEX_DEMO_MODE !== '0';
}
