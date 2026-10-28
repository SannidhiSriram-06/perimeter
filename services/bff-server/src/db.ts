import { Pool } from 'pg';

/**
 * Creates the Postgres connection pool from DATABASE_URL.
 * Throws at startup if the variable is missing, so the server never runs without a database.
 */
export function createPool(connectionString: string | undefined = process.env.DATABASE_URL): Pool {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    // Fail fast instead of queueing forever when the database is slow or unreachable.
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
  });
}
