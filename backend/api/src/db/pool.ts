import pg from 'pg';

import { databaseSslConfig, env } from '../config/env.js';

const { Pool, types } = pg;

// NUMERIC arrives as a string by default so that large values survive the round
// trip. Every money column in this API fits comfortably in a double, and the
// apps want numbers, so parse it here once instead of at every call site.
const PG_NUMERIC_OID = 1700;
types.setTypeParser(PG_NUMERIC_OID, (value: string) => Number.parseFloat(value));

// BIGINT (int8). products.id and order_events.id are the only int8 values we
// read and neither approaches 2^53, so returning a JS number keeps the JSON
// clean for the mobile clients.
const PG_INT8_OID = 20;
types.setTypeParser(PG_INT8_OID, (value: string) => Number.parseInt(value, 10));

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: databaseSslConfig(),
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // Our tables live in `commerce`; the read-only catalogue lives in `public`.
  options: '-c search_path=commerce,public',
});

pool.on('error', (error) => {
  // An idle client blew up (network drop, DB restart). pg will replace it; log
  // it so the incident is visible rather than silently retried.
  console.error('[db] idle client error:', error.message);
});

export type QueryParam = unknown;

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: QueryParam[] = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as never[]);
}

/**
 * Runs `fn` inside a transaction, committing on success and rolling back on any
 * throw. The client is always released, including when the rollback itself
 * fails.
 */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[db] rollback failed:', (rollbackError as Error).message);
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Used by GET /health to prove the VPS database is actually reachable. */
export async function checkDatabase(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const startedAt = Date.now();
  try {
    await pool.query('SELECT 1');
    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - startedAt, error: (error as Error).message };
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
