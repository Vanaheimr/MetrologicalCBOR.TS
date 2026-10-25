import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include:     ['tests/**/*.test.ts'],
    environment: 'node',

    // Several suites are property-based and run tens of thousands of cases,
    // which takes seconds rather than milliseconds. The 5 s default is a
    // tripwire that a loaded machine trips and an idle one does not, and a
    // test that fails only under load is worse than a slow one: it reports a
    // timeout with no counterexample, which reads exactly like a real defect.
    testTimeout: 120_000,

    // Hooks are budgeted separately, and the default is 10 s. That is not
    // enough for the `beforeAll` of `tests/bundle.test.ts`, which shells out
    // to `npm pack --dry-run` to ask what would be published: measured on
    // 2026-10-25, cold and straight after `npm ci`, it went past 10 s and the
    // suite reported a hook timeout with no failing assertion - the exact
    // shape of failure the line above exists to remove, and harder to read,
    // because a dead hook skips the tests that would have said what broke.
    // Warm, the same file runs in 1.6 s. A budget that depends on what the
    // package cache happens to hold is not a budget.
    hookTimeout: 120_000,

    coverage: {
      provider:  'v8',
      reporter:  ['text', 'lcov'],
      include:   ['src/**/*.ts'],
      exclude:   ['src/**/*.generated.ts', 'src/index.ts'],
    },
  },
});
