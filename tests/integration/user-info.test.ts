import { POST } from '@/app/api/user/get-user-info/route';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserInfo, getRemainingCredits, hasPermission } = vi.hoisted(() => ({
  getUserInfo: vi.fn(),
  getRemainingCredits: vi.fn(),
  hasPermission: vi.fn(),
}));

vi.mock('@/shared/models/user', () => ({ getUserInfo }));
vi.mock('@/shared/models/credit', () => ({ getRemainingCredits }));
vi.mock('@/shared/services/rbac', () => ({ hasPermission }));
vi.mock('@/core/rbac', () => ({
  PERMISSIONS: { ADMIN_ACCESS: 'admin.access' },
}));

const request = () =>
  new Request('http://localhost/api/user/get-user-info', { method: 'POST' });

describe('POST /api/user/get-user-info (route + response integration)', () => {
  beforeEach(() => {
    getUserInfo.mockReset();
    hasPermission.mockReset();
    getRemainingCredits.mockReset();
  });

  it('rejects anonymous access before permission or credit queries', async () => {
    getUserInfo.mockResolvedValue(null);
    expect(await (await POST(request())).json()).toEqual({
      code: -1,
      message: 'no auth, please sign in',
    });
    expect(hasPermission).not.toHaveBeenCalled();
    expect(getRemainingCredits).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'returns permissions and credits for the authenticated user (admin=%s)',
    async (isAdmin) => {
      getUserInfo.mockResolvedValue({ id: 'user-1', name: 'Test user' });
      hasPermission.mockResolvedValue(isAdmin);
      getRemainingCredits.mockResolvedValue(42);
      expect(await (await POST(request())).json()).toEqual({
        code: 0,
        message: 'ok',
        data: {
          id: 'user-1',
          name: 'Test user',
          isAdmin,
          credits: { remainingCredits: 42 },
        },
      });
      expect(hasPermission).toHaveBeenCalledWith('user-1', 'admin.access');
      expect(getRemainingCredits).toHaveBeenCalledWith('user-1');
    }
  );

  it.each(['session', 'permission', 'credits'])(
    'handles %s failure without returning internal error details',
    async (failure) => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      getUserInfo.mockResolvedValue({ id: 'user-1' });
      hasPermission.mockResolvedValue(false);
      getRemainingCredits.mockResolvedValue(0);
      const failingDependency = {
        session: getUserInfo,
        permission: hasPermission,
        credits: getRemainingCredits,
      }[failure]!;
      failingDependency.mockRejectedValue(
        new Error('internal-database-secret')
      );
      expect(await (await POST(request())).json()).toEqual({
        code: -1,
        message: 'get user info failed',
      });
      expect(log).toHaveBeenCalled();
    }
  );
});
