import makeWASocket, { useMultiFileAuthState, DisconnectReason } from 'baileys'
import pino from 'pino'
import qrcodeTerminal from 'qrcode-terminal'

// Baileys requires a pino-compatible logger instance. Kept quiet by default so
// this service's own logs stay readable; bump to 'debug' when troubleshooting
// the WhatsApp connection itself.
const baileysLogger = pino({ level: 'warn' })

// WhatsApp closes the socket with "restart required" (515) right after a QR
// pairing completes - that's expected, not a failure, and needs one reconnect
// to finish linking. A couple of retries also covers other transient closes.
const MAX_CONNECT_ATTEMPTS = 3

let sock = null
let connectingPromise = null
let idleTimer = null
let closingIntentionally = false

async function attemptConnect(authDir, attempt) {
  const { state, saveCreds } = await useMultiFileAuthState(authDir)
  const client = makeWASocket({ auth: state, logger: baileysLogger })

  client.ev.on('creds.update', saveCreds)

  return new Promise((resolve, reject) => {
    client.ev.on('connection.update', (update) => {
      const { connection, qr, lastDisconnect } = update

      if (qr) {
        console.log('[whatsapp] Scan this QR code from WhatsApp -> Linked Devices -> Link a Device:')
        qrcodeTerminal.generate(qr, { small: true })
      }

      if (connection === 'open') {
        sock = client
        resolve(client)
      }

      if (connection === 'close') {
        // Our own idle-disconnect (scheduleIdleDisconnect) - expected, nothing to do.
        if (closingIntentionally) return

        const statusCode = lastDisconnect?.error?.output?.statusCode
        const loggedOut = statusCode === DisconnectReason.loggedOut

        sock = null

        if (loggedOut) {
          console.error(
            '[whatsapp] Session was logged out from the phone. Delete the AUTH_DIR folder and ' +
              'run "npm run link" again to re-link.',
          )
          reject(lastDisconnect?.error || new Error('WhatsApp session logged out'))
          return
        }

        if (attempt < MAX_CONNECT_ATTEMPTS) {
          const reason =
            statusCode === DisconnectReason.restartRequired
              ? 'restart required after pairing'
              : `closed unexpectedly (code ${statusCode ?? 'unknown'})`
          console.log(
            `[whatsapp] Connection ${reason} - reconnecting (attempt ${attempt + 1}/${MAX_CONNECT_ATTEMPTS})...`,
          )
          attemptConnect(authDir, attempt + 1).then(resolve, reject)
        } else {
          reject(lastDisconnect?.error || new Error('WhatsApp connection failed after multiple attempts'))
        }
      }
    })
  })
}

async function connect(authDir) {
  if (sock) return sock
  if (connectingPromise) return connectingPromise

  // Reset at the start of every fresh connect cycle - scheduleIdleDisconnect
  // only ever sets this true immediately before ending a socket we're done
  // with, so a new cycle should never inherit that state.
  closingIntentionally = false
  connectingPromise = attemptConnect(authDir, 1)

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
    }
  }, idleDisconnectMs)
}

export async function pushStatus(text, { authDir, idleDisconnectMs }) {
  const client = await connect(authDir)
  await client.updateProfileStatus(text)
  scheduleIdleDisconnect(idleDisconnectMs)
}
