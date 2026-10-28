// Shared by the tests that need Postgres (api.test.ts, alerts.test.ts).
export const DATABASE_URL = process.env.TEST_DATABASE_URL;

// CI must never "pass" by silently skipping the database tests.
if (!DATABASE_URL && process.env.CI) {
  throw new Error('TEST_DATABASE_URL must be set in CI: the API tests need a Postgres loaded from deploy/db/init.sql');
}

export const skipWithoutDb = !DATABASE_URL && 'TEST_DATABASE_URL not set';
if (skipWithoutDb) {
  console.warn('WARNING: skipping the Postgres API tests. Start the database (see deploy/README.md) and set TEST_DATABASE_URL to run them.');
}
