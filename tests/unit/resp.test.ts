import { describe, expect, it } from 'vitest';

import { respData, respErr, respJson, respOk } from '@/shared/lib/resp';

describe('API response contract', () => {
  it('returns a JSON success envelope with data', async () => {
    const response = respData({ id: 'example' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({
      code: 0,
      message: 'ok',
      data: { id: 'example' },
    });
  });

  it('preserves the existing empty-data envelope', async () => {
    expect(await respData(null).json()).toEqual({
      code: 0,
      message: 'ok',
      data: [],
    });
    expect(await respOk().json()).toEqual({ code: 0, message: 'ok' });
  });

  it('uses the application error code even though HTTP status is 200', async () => {
    const response = respErr('no auth');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: -1, message: 'no auth' });
  });

  it('supports custom envelopes', async () => {
    expect(await respJson(7, 'pending', { retry: true }).json()).toEqual({
      code: 7,
      message: 'pending',
      data: { retry: true },
    });
  });
});
