import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`✅ API listening on http://localhost:${env.PORT}/api/v1`);
  console.log(`   Health: http://localhost:${env.PORT}/api/v1/health`);
  console.log(`   Env:    ${env.NODE_ENV}`);
});

function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down gracefully...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));