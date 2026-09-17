import { describe, expect, it } from 'vitest';

import {
  EVIDEX_DEMO_REVIEWER,
  isEvidexDemoMode,
} from '@/shared/lib/evidex-demo-mode';

describe('Evidex demo mode', () => {
  it.each([undefined, '', '1', 'true', 'yes'])(
    'keeps the single-user demo open by default for %s',
    (value) => {
      expect(isEvidexDemoMode({ EVIDEX_DEMO_MODE: value })).toBe(true);
    }
  );

  it('restores administrator authentication only for the explicit value 0', () => {
    expect(isEvidexDemoMode({ EVIDEX_DEMO_MODE: '0' })).toBe(false);
  });

  it('uses one stable, auditable reviewer identity', () => {
    expect(EVIDEX_DEMO_REVIEWER).toEqual({
      id: 'demo-reviewer',
      email: 'demo-reviewer@evidex.local',
      name: 'Evidex 演示审核员',
      role: 'REVIEWER',
    });
  });
});
