import { beforeAll, afterEach, afterAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './server';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' });
});
afterEach(() => {
  server.resetHandlers();
  // `globals: false` in vitest.config.ts means React Testing Library's
  // implicit auto-cleanup (which relies on a global `afterEach`) never
  // registers, so component tests must clean up explicitly. A no-op when
  // nothing was rendered (plain engine/data test files).
  cleanup();
});
afterAll(() => {
  server.close();
});
