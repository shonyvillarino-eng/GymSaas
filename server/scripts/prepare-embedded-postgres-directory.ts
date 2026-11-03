import fs from 'node:fs'
import path from 'node:path'

const cwd = process.cwd()
const dir = path.resolve(cwd, '.pgdata')

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true })
  console.log('created', dir)
} else {
  console.log('exists', dir)
}
