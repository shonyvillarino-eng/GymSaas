import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = process.cwd()
const gitignore = path.join(ROOT, '.gitignore')

console.log('🔍 Verificando entorno...\n')

// 1) Comprobar .gitignore
const giContent = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, 'utf8') : ''
const ignores = [
  '.env',
  '.env.local',
  '.env.*.local',
  '*.log',
  '*.pid',
]
for (const pattern of ignores) {
  if (!giContent.includes(pattern)) {
    console.warn(`⚠️  Falta "${pattern}" en .gitignore`)
  }
}

// 2) Comprobar que .env no está versionado
try {
  const envPath = path.join(ROOT, '.env')
  if (!fs.existsSync(envPath)) {
    console.log('ℹ️  .env no existe (esperado en repo público)')
  } else {
    console.warn('⚠️  .env existe pero no debería estar versionado')
  }
} catch {
  // ignorar
}

// 3) Variables de entorno mínimas
const required = ['DATABASE_URL']
const missing = required.filter((v) => !process.env[v])
if (missing.length) {
  console.warn(`⚠️  Faltan variables: ${missing.join(', ')}`)
} else {
  console.log('✅ Variables de entorno mínimas presentes')
}

// 4) Directorio .pgdata para embedded-postgres
const pgdata = path.join(ROOT, 'server', '.pgdata')
if (!fs.existsSync(pgdata)) {
  fs.mkdirSync(pgdata, { recursive: true })
  console.log('📁 Creado .pgdata/ para embedded-postgres')
} else {
  console.log('📁 .pgdata/ ya existe')
}

console.log('\n✅ Verificación de entorno completada')
