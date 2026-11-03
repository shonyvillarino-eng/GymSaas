import { fork } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const script = join(__dirname, 'cleanup.mjs');

fork(script, ['--dry-run'], { stdio: 'inherit' });
console.log('spawned', script);
