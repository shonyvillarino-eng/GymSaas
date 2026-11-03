import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

async function listEnvFiles(): Promise<string[]> {
  const out: string[] = []
  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = path.resolve(ROOT, entry.name)
    const envPath = path.resolve(dir, '.env')
    const envLocal = path.resolve(dir, '.env.local')
    const envVars = path.resolve(dir, '.env.vars')
    for (const p of [envPath, envLocal, envVars]) {
      if (fs.existsSync(p)) {
        out.push(p)
      }
    }
    try {
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith('.env.')) {
          const p = path.resolve(dir, f)
          if (fs.existsSync(p)) out.push(p)
        }
      }
    } catch {
      // ignore non-readable
    }
  }
  return out
}

async function hasSecrets(files: string[]): Promise<boolean> {
  for (const p of files) {
    const content = fs.readFileSync(p, 'utf8')
    if (/^(export\s+)?(DATABASE_URL|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|SESSION_SECRET|APP_SECRET|OPENAI_API_KEY|OPENAI_ORGANIZATION|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|FREEBUFF_CLIENT_SECRET|JWT_SECRET|ENCRYPTION_KEY|ENCRYPTION_PASSWORD)\s*=/mi.test(content)) {
      return true
    }
  }
  return false
}

const envFiles = await listEnvFiles()
const containsSecrets = await hasSecrets(envFiles)

console.log(JSON.stringify({
  envFiles,
  hasSecretLikeVars: containsSecrets,
  nodeEnv: process.env.NODE_ENV ?? 'not set',
  hasDockerfile: fs.existsSync(path.resolve(ROOT, 'server', 'Dockerfile')),
  hasTmpPgdata: fs.existsSync(path.resolve(ROOT, 'server', '.pgdata')),
}, null, 2))
