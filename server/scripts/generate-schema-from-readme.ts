import { PrismaClient } from '@prisma/client'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCHEMA_PATH = resolve(__dirname, '..', 'prisma', 'schema.prisma')

interface SchemaConfig {
  provider: string
  url: string
  models: string[]
}

async function parseSchema() {
  const readmePath = resolve(__dirname, '..', 'README.md')
  const content = readFileSync(readmePath, 'utf-8')
  const modelMatches = [...content.matchAll(/### (Modelo|Model):?\s*([\w\s]+)/g)]

  const models: string[] = []

  for (const match of modelMatches) {
    const name = match[2].trim()
    models.push(name)
  }

  return { models }
}

async function generateSchema() {
  const { models } = await parseSchema()
  const schema = `
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Schema for Gym Management SaaS
${models
  .map((m) => `// Model: ${m}`)
  .join('\n\n')}

// Add your models below:
${models
  .map((m) => `model ${m} {\n  id        String   @id @default(cuid())\n  createdAt DateTime @default(now())\n  updatedAt DateTime @updatedAt\n}`)
  .join('\n\n')}
`

  writeFileSync(SCHEMA_PATH, schema, 'utf-8')
  console.log('✅ Esquema generado a partir de README.md')
}

generateSchema().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
