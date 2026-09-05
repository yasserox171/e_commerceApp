import { createApp } from './app.js';
import { env, isProduction, productionConfigProblems } from './config/env.js';
import { checkDatabase, closePool } from './db/pool.js';

const problems = productionConfigProblems();
if (problems.length > 0) {
  console.error('Refusing to start in production with an unsafe configuration:');
  for (const problem of problems) console.error(`  • ${problem}`);
  process.exit(1);
}

const app = createApp();
const server = app.listen(env.PORT, () => {
  console.log(`▸ API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  console.log(`▸ payment provider: ${env.PAYMENT_PROVIDER} · prepaid card only, no COD`);
});

// A dead database should be visible at boot, not at the first request. It is a
// warning rather than a hard exit so the API can come up before Postgres does.
void checkDatabase().then((result) => {
  if (result.ok) {
    console.log(`▸ database reachable (${result.latencyMs}ms)`);
  } else {
    console.error(`▸ database NOT reachable: ${result.error}`);
    if (isProduction) console.error('  the API is up but every data route will return 503');
  }
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n▸ ${signal} received, closing gracefully…`);

  // Stop accepting connections, let in-flight requests finish, then drop the
  // pool. The timer guarantees we exit even if a socket refuses to close.
  const forceExit = setTimeout(() => {
    console.error('▸ shutdown timed out, exiting anyway');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(() => {
    void closePool().then(() => {
      console.log('▸ bye');
      process.exit(0);
    });
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('▸ unhandled promise rejection:', reason);
});
