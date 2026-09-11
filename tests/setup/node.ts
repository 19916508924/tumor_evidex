import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

// Test suites must declare HTTP fixtures; accidental live API calls fail.
export const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
