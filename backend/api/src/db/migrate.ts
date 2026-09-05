/**
 * Minimal, dependency-free migration runner.
 *
 *   npm run db:migrate          apply everything pending
 *   npm run db:migrate:status   list applied / pending
 *
 * Each .sql file in db/migrations runs inside its own transaction and is
 * recorded in commerce.schema_migrations together with a SHA-256 of its
 * contents, so editing an already-applied migration is caught instead of
 * silently ignored.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { closePool, pool, withTransaction } from './pool.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function resolveMigrationsDir(): string {
  const fromEnv = process.env.MIGRATIONS_DIR;
  const candidates = [
    ...(fromEnv ? [path.resolve(fromEnv)] : []),
    // running from src/db via tsx  -> backend/api/src/db -> repo root
    path.resolve(here, '..', '..', '..', '..', 'db', 'migrations'),
    // running from dist/db after a build -> backend/api/dist/db -> repo root
    path.resolve(here, '..', '..', '..', '..', '..', 'db', 'migrations'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isDirectory()) return candidate;
  }
  throw new Error(
    `Could not locate db/migrations. Tried:\n${candidates.map((c) => `  ${c}`).join('\n')}\n` +
      'Set MIGRATIONS_DIR to override.',
  );
}

interface Migration {
  name: string;
  sql: string;
  checksum: string;
}

function loadMigrations(dir: string): Migration[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en'))
    .map((file) => {
      const sql = readFileSync(path.join(dir, file), 'utf8');
      return {
        name: file,
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      };
    });
}

async function ensureBookkeepingTable(): Promise<void> {
  // `CREATE SCHEMA IF NOT EXISTS` checks the CREATE privilege on the database
  // before it checks whether the schema exists, so issuing it unconditionally
  // fails for a role that merely owns an already-created `commerce`. Look first,
  // and only ask for the privilege when the schema is genuinely missing — that
  // is what lets the deployment run without CREATE on the database.
  // pg_namespace rather than information_schema.schemata: the latter hides
  // schemas the current role does not own.
  const existing = await pool.query(`SELECT 1 FROM pg_namespace WHERE nspname = 'commerce'`);
  if (existing.rowCount === 0) {
    await pool.query('CREATE SCHEMA commerce');
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS commerce.schema_migrations (
      name        TEXT PRIMARY KEY,
      checksum    TEXT NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      duration_ms INTEGER NOT NULL DEFAULT 0
    )
  `);
}

async function appliedMigrations(): Promise<Map<string, string>> {
  const { rows } = await pool.query<{ name: string; checksum: string }>(
    'SELECT name, checksum FROM commerce.schema_migrations',
  );
  return new Map(rows.map((row) => [row.name, row.checksum]));
}

async function up(): Promise<void> {
  const dir = resolveMigrationsDir();
  const migrations = loadMigrations(dir);
  await ensureBookkeepingTable();
  const applied = await appliedMigrations();

  const drifted = migrations.filter(
    (m) => applied.has(m.name) && applied.get(m.name) !== m.checksum,
  );
  if (drifted.length > 0) {
    throw new Error(
      'These migrations were already applied but their contents changed:\n' +
        drifted.map((m) => `  • ${m.name}`).join('\n') +
        '\nWrite a new migration instead of editing an applied one.',
    );
  }

  const pending = migrations.filter((m) => !applied.has(m.name));
  if (pending.length === 0) {
    console.log(`✔ database is up to date (${migrations.length} migration(s) applied)`);
    return;
  }

  console.log(`Applying ${pending.length} migration(s) from ${dir}`);
  for (const migration of pending) {
    const startedAt = Date.now();
    process.stdout.write(`  → ${migration.name} … `);
    await withTransaction(async (client) => {
      await client.query(migration.sql);
      await client.query(
        `INSERT INTO commerce.schema_migrations (name, checksum, duration_ms)
         VALUES ($1, $2, $3)`,
        [migration.name, migration.checksum, Date.now() - startedAt],
      );
    });
    console.log(`ok (${Date.now() - startedAt}ms)`);
  }
  console.log('✔ migrations complete');
}

async function status(): Promise<void> {
  const dir = resolveMigrationsDir();
  const migrations = loadMigrations(dir);
  await ensureBookkeepingTable();
  const applied = await appliedMigrations();

  console.log(`Migrations in ${dir}\n`);
  for (const migration of migrations) {
    const known = applied.get(migration.name);
    const mark = known === undefined ? '· pending' : known === migration.checksum ? '✔ applied' : '✗ CHANGED';
    console.log(`  ${mark}  ${migration.name}`);
  }

  const orphans = [...applied.keys()].filter(
    (name) => !migrations.some((m) => m.name === name),
  );
  if (orphans.length > 0) {
    console.log('\n  Recorded but no longer on disk:');
    for (const name of orphans) console.log(`    ? ${name}`);
  }
}

const command = process.argv[2] ?? 'up';

try {
  if (command === 'up') {
    await up();
  } else if (command === 'status') {
    await status();
  } else {
    console.error(`Unknown command "${command}". Use "up" or "status".`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`\n✗ migration failed: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await closePool();
}
