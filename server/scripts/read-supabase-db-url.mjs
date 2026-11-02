import 'dotenv/config'
import { readFileSync } from 'fs'

const envRaw = readFileSync('server/.env.local', 'utf8')

// Matches lines like:
//   SUPABASE_DB_URL=postgresql://...
//   export SUPABASE_DB_URL="postgresql://..."
const match = envRaw.match(/^(?:export\s+)?SUPABASE_DB_URL=(["']?)([^"'#\n]+)\1$/m)
const value = match ? match[2].trim() : null

if (!value) {
  console.error('NO_SUPABASE_DB_URL')
  process.exit(2)
}

console.log(value)
