import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const IGNORE_FILES = [
  '.env',
  '.env.local',
  '.env.*.local',
  '.env.loaded',
  'server/.pgdata',
]

function listFiles(dir: string, base = ''): string[] {
  const results: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    const relativePath = path.join(base, entry.name)

    if (IGNORE_FILES.includes(entry.name) || entry.name.startsWith('.')) {
      if (entry.isDirectory()) {
        results.push(`${relativePath}/ (ignored)`)
      }
      continue
    }

    if (entry.isDirectory()) {
      results.push(...listFiles(fullPath, relativePath))
    } else {
      results.push(relativePath)
    }
  }
  return results
}

const files = listFiles(ROOT)

console.log('📁 Archivos supervisados por FASE 0:\n')
for (const file of files) {
  console.log(`- ${file}`)
}
