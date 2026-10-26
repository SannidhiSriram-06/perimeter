import { Pool } from 'pg';

/**
 * Creates the Postgres connection pool from DATABASE_URL.
 * Throws at startup if the variable is missing, so the server never runs without a database.
 */
export function createPool(connectionString: string | undefined = process.env.DATABASE_URL): Pool {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  return new Pool({ connectionString });
}
