import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { server } from '../setup/node';

describe('test HTTP isolation', () => {
  it('fails undeclared HTTP calls before reaching a real provider', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(fetch('https://example.invalid/undeclared')).rejects.toThrow(
      'Cannot bypass a request'
    );
    expect(error).toHaveBeenCalled();
  });

  it('serves an explicitly declared fixture', async () => {
    server.use(
      http.get('https://example.invalid/fixture', () =>
        HttpResponse.json({ result: 'fixture-only' })
      )
    );
    expect(
      await (await fetch('https://example.invalid/fixture')).json()
    ).toEqual({ result: 'fixture-only' });
  });
});
