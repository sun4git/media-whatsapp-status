import makeWASocket, { useMultiFileAuthState, DisconnectReason } from 'baileys'
import pino from 'pino'
import qrcodeTerminal from 'qrcode-terminal'

// Baileys requires a pino-compatible logger instance. Kept quiet by default so
// this service's own logs stay readable; bump to 'debug' when troubleshooting
// the WhatsApp connection itself.
const baileysLogger = pino({ level: 'warn' })

let sock = null
let connectingPromise = null
let idleTimer = null
let closingIntentionally = false

async function connect(authDir) {
  if (sock) return sock
  if (connectingPromise) return connectingPromise

  connectingPromise = (async () => {
    const { state, saveCreds } = await useMultiFileAuthState(authDir)
    const client = makeWASocket({ auth: state, logger: baileysLogger })

    client.ev.on('creds.update', saveCreds)

    await new Promise((resolve, reject) => {
      client.ev.on('connection.update', (update) => {
        const { connection, qr, lastDisconnect } = update

        if (qr) {
          console.log('[whatsapp] Scan this QR code from WhatsApp -> Linked Devices -> Link a Device:')
          qrcodeTerminal.generate(qr, { small: true })
        }

        if (connection === 'open') {
          resolve(client)
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode
          const loggedOut = statusCode === DisconnectReason.loggedOut

          if (loggedOut) {
            console.error(
              '[whatsapp] Session was logged out from the phone. Delete the AUTH_DIR folder and ' +
                'run "npm run link" again to re-link.',
            )
          }

          if (!closingIntentionally) {
            sock = null
            reject(lastDisconnect?.error || new Error('WhatsApp connection closed before it opened'))
          }
        }
      })
    })

    sock = client
    return client
  })()

  try {
    return await connectingPromise
  } finally {
    connectingPromise = null
  }
}

function scheduleIdleDisconnect(idleDisconnectMs) {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    if (sock) {
      closingIntentionally = true
      sock.end(undefined)
      sock = null
      closingIntentionally = false
    }
  }, idleDisconnectMs)
}

export async function pushStatus(text, { authDir, idleDisconnectMs }) {
  const client = await connect(authDir)
  await client.updateProfileStatus(text)
  scheduleIdleDisconnect(idleDisconnectMs)
}
