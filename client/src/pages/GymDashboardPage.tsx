import fs from 'node:fs';
import path from 'node:path';
import { argv, stdout } from 'node:process';

const log = (...args: unknown[]) => { stdout.write(args.map(a => String(a)).join(' ') + '\n'); };

function isDir(p: string): boolean {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function walk(dir: string, base: string, cb: (p: string) => void) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const rel = path.relative(base, path.join(dir, e.name));
    if (e.isDirectory()) walk(path.join(dir, e.name), base, cb);
    else if (e.isFile()) cb(path.join(base, rel));
  }
}

const dir = argv[2] ?? '.';
walk(dir, dir, (p) => {
  log(p);
});
