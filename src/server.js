import express from 'express'
import multer from 'multer'
import { config } from './config.js'
import { formatNowPlaying } from './statusFormatter.js'
import { scheduleStatusUpdate } from './queue.js'
import { parsePlexWebhook } from './sources/plex.js'

const app = express()
const upload = multer({ storage: multer.memoryStorage() })

const watchedUsers = config.watchedUsers.map((u) => u.toLowerCase())

const updateOpts = {
  authDir: config.authDir,
  idleDisconnectMs: config.idleDisconnectMs,
  debounceMs: config.debounceMs,
}

function handleNowPlayingEvent(result) {
  if (!result) return
  if (result.kind === 'playing') {
    scheduleStatusUpdate(formatNowPlaying(result), updateOpts)
  } else if (result.kind === 'stopped' && config.clearStatusOnStop) {
    scheduleStatusUpdate(config.defaultStatusText, updateOpts)
  }
}

app.get('/health', (req, res) => res.json({ ok: true }))

app.post(config.plexWebhookPath, upload.any(), (req, res) => {
  // Ack immediately - Plex doesn't need to wait for the WhatsApp side.
  res.sendStatus(200)

  try {
    handleNowPlayingEvent(parsePlexWebhook(req.body.payload, watchedUsers))
  } catch (err) {
    console.error('[server] Error handling Plex webhook:', err)
  }
})

app.listen(config.port, () => {
  console.log(`[server] Listening on port ${config.port}`)
  console.log(`[server]   Plex webhook path: ${config.plexWebhookPath}`)
  console.log(`[server] Watching user(s): ${config.watchedUsers.join(', ') || '(none configured)'}`)
})
