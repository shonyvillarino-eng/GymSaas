import { PrismaClient } from '@prisma/client'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface SchemaConfig {
  provider: string
  url: string
  models: string[]
}

async function parseSchema() {
  const readmePath = resolve(__dirname, '..', 'README.md')
  const content = readFileSync(readmePath, 'utf-8')
  const modelMatches = [...content.matchAll(/### (Modelo):\s*(.+)/g)]

  const models: SchemaConfig['models'] = []

  for (const match of modelMatches) {
    const name = match[2].trim()
    models.push(name)
  }

  return { models }
}

async function generateSchemaFromSchema(config: SchemaConfig) {
  const schema = `
// Schema for Gym Management SaaS
${config.models
  .map(
    (model) => `model ${model} {
  ${model}Id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}`,
  )
  .join('\n\n')}
`
  return schema
}

async function seedFromSchema() {
  const prisma = new PrismaClient()

  const { models } = await parseSchema()

  // Generar modelos desde SCHEMA.md
  const schema = await generateSchemaFromSchema({
    provider: 'postgresql',
    url: process.env.DATABASE_URL || '',
    models,
  })

  writeFileSync(resolve(__dirname, 'prisma', 'schemaFromReadme.prisma'), schema, 'utf-8')

  console.log('✅ Esquema generado desde SCHEMA.md')
}

seedFromSchema().catch(console.error)
