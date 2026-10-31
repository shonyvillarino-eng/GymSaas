/**
 * Local PostgreSQL for development and integration suites.
 *
 * Starts an embedded, persistent cluster on 127.0.0.1:5432 and keeps the
 * process alive until SIGINT/SIGTERM. The data directory is gitignored.
 *
 *   node scripts/dev-db.mjs
 *
 * The generated credentials match the DATABASE_URL used by the suites:
 *   postgresql://postgres:postgres@127.0.0.1:5432/gym_saas
 */
import EmbeddedPostgres from 'embedded-postgres';

const dataDir = process.env.PGDATA_DIR ?? './.pgdata';
const port = Number(process.env.PGPORT ?? 5432);

const postgres = new EmbeddedPostgres({
  databaseDir: dataDir,
  port,
  user: 'postgres',
  password: 'postgres',
  authMethod: 'password',
  persistent: true,
  onLog: (message) => {
    if (process.env.PG_VERBOSE === '1') console.log(`[pg] ${message}`);
  },
  onError: (error) => console.error('[pg]', error),
});

try {
  await postgres.initialise();
} catch (error) {
  // Already initialised: reuse the existing cluster.
  console.log('[pg] reusing existing data directory');
}

await postgres.start();

try {
  await postgres.createDatabase('gym_saas');
  console.log('[pg] created database gym_saas');
} catch {
  console.log('[pg] database gym_saas already exists');
}

console.log(`[pg] ready on 127.0.0.1:${port}`);

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[pg] ${signal}, stopping`);
  await postgres.stop().catch(() => undefined);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
setInterval(() => undefined, 60_000);
