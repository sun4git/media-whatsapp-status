import express from 'express'
import multer from 'multer'
import { config } from './config.js'
import { formatNowPlaying } from './statusFormatter.js'
import { scheduleStatusUpdate } from './queue.js'
import { parsePlexWebhook } from './sources/plex.js'

const app = express()
const upload = multer({ storage: multer.memoryStorage() })

const watchedUsers = config.watchedUsers.map((u) => u.toLowerCase())
const watchedDevices = config.watchedDevices.map((d) => d.toLowerCase())

// watchedUsers is required (empty means "match nobody" - see config.js's
// startup warning); watchedDevices is a genuinely optional, additive filter
// (empty means "don't restrict by device"). Both must pass when configured.
function isWatched(username, deviceName) {
  const userOk = watchedUsers.includes((username || '').toLowerCase())
  const deviceOk = watchedDevices.length === 0 || watchedDevices.includes((deviceName || '').toLowerCase())
  return userOk && deviceOk
}

const updateOpts = {
  authDir: config.authDir,
  idleDisconnectMs: config.idleDisconnectMs,
  debounceMs: config.debounceMs,
}

// movie and episode share the same "long-form video" defaults; track (music)
// gets its own, much shorter, defaults.
const MEDIA_STYLE = {
  track: { emoji: config.trackEmoji, durationSec: config.trackDurationSec },
  movie: { emoji: config.videoEmoji, durationSec: config.videoDurationSec },
  episode: { emoji: config.videoEmoji, durationSec: config.videoDurationSec },
}

function handleNowPlayingEvent(result) {
  if (!result) return
  if (!isWatched(result.username, result.deviceName)) return
  if (result.kind === 'playing') {
    const style = MEDIA_STYLE[result.mediaType] ?? MEDIA_STYLE.track
    scheduleStatusUpdate(
      { text: formatNowPlaying(result), emoji: style.emoji, durationSec: style.durationSec },
      updateOpts,
    )
  } else if (result.kind === 'stopped' && config.clearStatusOnStop) {
    // Empty text through this API doesn't actually remove the About entry -
    // WhatsApp silently ignores it - so this sets a real generic fallback
    // instead, using the same "set text" call that already works for tracks.
    scheduleStatusUpdate(
      { text: config.idleStatusText, emoji: config.idleEmoji, durationSec: config.idleDurationSec },
      updateOpts,
    )
  }
}

app.get('/health', (req, res) => res.json({ ok: true }))

app.post(config.plexWebhookPath, upload.any(), (req, res) => {
  // Ack immediately - Plex doesn't need to wait for the WhatsApp side.
  res.sendStatus(200)

  try {
    handleNowPlayingEvent(parsePlexWebhook(req.body.payload))
  } catch (err) {
    console.error('[server] Error handling Plex webhook:', err)
  }
})

app.listen(config.port, () => {
  console.log(`[server] Listening on port ${config.port}`)
  console.log(`[server]   Plex webhook path: ${config.plexWebhookPath}`)
  console.log(`[server] Watching user(s): ${config.watchedUsers.join(', ') || '(none configured)'}`)
  console.log(`[server] Watching device(s): ${config.watchedDevices.join(', ') || '(none — all devices allowed)'}`)
})
