import fs from 'node:fs'
import path from 'node:path'

const cwd = process.cwd()
const dir = path.resolve(cwd, '.pgdata')

if (!fs.existsSync(dir)) {
  fs.mkdirSync(path.resolve(cwd, '.pgdata'), { recursive: true })
  console.log('✓ Created', dir)
} else {
  console.log('✓ Already exists', dir)
}
