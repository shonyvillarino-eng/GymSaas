import { PrismaClient } from '@prisma/client'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const schemaPath = resolve(__dirname, 'prisma', 'schema.prisma')
const readmePath = resolve(__dirname, '..', 'README.md')

// Extrae los modelos de SCHEMA.md para generar un esquema temporal
function extractModelsFromReadme(): string[] {
  const content = readFileSync(readmePath, 'utf-8')
  const modelRegex = /\n### Modelo|Model:\s*([\w]+)/g
  const models: string[] = []
  let match

  while ((match = modelRegex.exec(content)) !== null) {
    models.push(match[1].trim())
  }

  return [...new Set(models)]
}

async function main() {
  const models = extractModelsFromReadme()

  const schema = `
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

${models.map(m => `model ${m} { id String @id @default(uuid()) }`).join('\n\n')}
`

  writeFileSync(schemaPath, schema, 'utf-8')
  console.log(`✅ Schema generado con ${models.length} modelos desde README.md`)
  console.log(`🗄️  Esquema: ${schemaPath}`)
}

main().catch((error) => {
  console.error('❌ Error al generar el esquema:', error)
  process.exit(1)
})
