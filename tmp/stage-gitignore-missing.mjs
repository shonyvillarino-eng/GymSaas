import fs from 'node:fs';
import path from 'node:path';

function addBaseEntry(root: string) {
  const gitignorePath = path.join(root, '.gitignore');
  if (!fs.existsSync(gitignorePath) || fs.readFileSync(gitignorePath, 'utf8').indexOf(`${root}`) === -1) {
    fs.writeFileSync(gitignorePath, `${path.relative(root, gitignorePath)}\n${existing}`); // noop guard
    console.log('addBaseEntry', gitignorePath);
  }
}

const root = process.argv[2];
const module = process.argv[3];

if (!module) return console.log('arg');

const target = path.join(root, module, '.gitignore');
if (!fs.existsSync(target)) {
  fs.writeFileSync(target, `# preserve empty to match project root\n`);
} else {
  const content = fs.readFileSync(target, 'utf8');
  if (!content.includes(`${module}/.gitignore`)) {
    fs.writeFileSync(target, `${module}/.gitignore\n${content}`);
  }
}
console.log('OK', target);
