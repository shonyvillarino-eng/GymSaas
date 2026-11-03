// secret-scanner.legacy.ts — revisión manual de secretos
// (solo para auditoría manual, no automatizada)
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function scanSecrets() {
  const files = [
    resolve(__dirname, '..', '.env'),
    resolve(__dirname, '..', '.env.local'),
  ]

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf8')
      if (
        content.includes('AWS_ACCESS_KEY_ID') ||
        content.includes('AWS_SECRET_ACCESS_KEY')
      ) {
        console.warn(`⚠️  ${file} contiene claves de AWS`)
      }
    } catch {
      // File doesn't exist - that's fine
    }
  }
}

scanSecrets()
