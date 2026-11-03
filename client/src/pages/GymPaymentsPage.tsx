import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? '.';
const path = join(root, 'server/.gitignore');
const file = existsSync(path) ? readFileSync(path, 'utf8') : '';
writeFileSync(path, file.replace(/^(dist\/|build\/|.*\.log|tmp\/)/gm, ''));
console.log('updated', path);
