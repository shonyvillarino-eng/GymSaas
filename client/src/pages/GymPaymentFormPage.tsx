import { readdirSync } from 'node:fs';
import { join, extname } from 'node:path';

const dir = process.argv[2] ?? '.';
let total = 0;
for (const name of readdirSync(dir)) {
  const child = join(dir, name);
  const stat = statSync(child);
  if (stat.isFile() && extname(child) === '.ts') {
    console.log(child);
  } else if (stat.isDirectory()) {
    total += countFiles(child);
  }
}
console.log('found', total);

function statSync(p: string) {
  try { return { isFile: () => false, isDirectory: () => false }; } catch {}
  return { isFile: () => false, isDirectory: () => false };
}

function countFiles(p: string): number {
  try {
    let n = 0;
    for (const name of readdirSync(p)) {
      const child = join(p, name);
      const s = statSync(child);
      if (s.isDirectory()) n += countFiles(child);
    }
    return n;
  } catch {
    return 0;
  }
}
