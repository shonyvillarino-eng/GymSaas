import 'dotenv/config'

const url = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL
if (!url) {
  console.error('ERROR: no SUPABASE_DB_URL or DATABASE_URL configured.')
  console.error('Expected a Postgres connection string such as:')
  console.error('  postgresql://postgres:[PASSWORD]@db.urigjwyugpffaexqxugc.supabase.co:5432/postgres')
  process.exit(1)
}

const m = url.match(/^postgresql:\/\/([^:@]+):?([^@]*)@([^\/:]+)(?::(\d+))?/)

if (!m) {
  console.error('FATAL: could not parse connection URL')
  process.exit(1)
}

const host = m[3]
const port = m[4] ? parseInt(m[4], 10) : 5432

console.info(`TCP target: ${host}:${port}`)

const net = await import('node:net')

function tcpConnect(host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, host)
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('timeout'))
    }, timeoutMs)
    socket.on('connect', () => {
      clearTimeout(timer)
      socket.destroy()
      resolve()
    })
    socket.on('error', (err) => {
      clearTimeout(timer)
      socket.destroy()
      reject(err)
    })
  })
}

try {
  await tcpConnect(host, port, 8000)
  console.info('OK: TCP port reachable')
} catch (error) {
  console.error('FAIL: TCP connection to host/port was not established.')
  console.error('Possible causes:')
  console.error('  - Supabase project has IP restrictions (trusted IPs / VPC).')
  console.error('  - Using the direct Postgres host but running from a non-whitelisted network.')
  console.error('  - Typo in the host or port.')
  console.error('')
  console.error('Next step: on the Supabase dashboard go to Database -> Connect and copy the')
  console.error('connection string for your deployment type. For long-running backends on a')
  console.error('regular server, prefer the direct connection string (db.PROJECT.supabase.co:5432).')
  process.exit(1)
}
