import express from 'express'
import multer from 'multer'
import { config } from './config.js'
import { formatNowPlaying } from './statusFormatter.js'
import { scheduleStatusUpdate } from './queue.js'
import { parsePlexWebhook } from './sources/plex.js'
import { startSpotifyPolling } from './sources/spotify.js'
import { parseWhatsPlayingPayload } from './sources/whatsplaying.js'

const app = express()
const upload = multer({ storage: multer.memoryStorage() })

const watchedUsers = config.watchedUsers.map((u) => u.toLowerCase())
const watchedDevices = config.watchedDevices.map((d) => d.toLowerCase())

// watchedUsers is required (empty means "match nobody" - see config.js's
// startup warning) for genuinely multi-account sources (Plex, Spotify) where
// WATCHED_USERS picks whose playback counts. The WhatsPlaying app source has
// no such ambiguity - it's inherently one phone -> this one server instance
// -> the one WhatsApp account this process is logged into, so callers for
// that source pass requireUser: false to skip it entirely. watchedDevices is
// a genuinely optional, additive filter for every source (empty means
// "don't restrict by device") - still meaningful even for WhatsPlaying if
// more than one phone ever points at the same server.
function isWatched(username, deviceName, { requireUser = true } = {}) {
  const userOk = !requireUser || watchedUsers.includes((username || '').toLowerCase())
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

function handleNowPlayingEvent(result, isWatchedOpts = {}) {
  if (!result) return
  if (!isWatched(result.username, result.deviceName, isWatchedOpts)) return
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

app.post(config.whatsPlayingWebhookPath, express.json(), (req, res) => {
  res.sendStatus(200)

  try {
    // No WATCHED_USERS check for this source - see isWatched's comment.
    handleNowPlayingEvent(parseWhatsPlayingPayload(req.body), { requireUser: false })
  } catch (err) {
    console.error('[server] Error handling WhatsPlaying webhook:', err)
  }
})

app.listen(config.port, () => {
  console.log(`[server] Listening on port ${config.port}`)
  console.log(`[server]   Plex webhook path: ${config.plexWebhookPath}`)
  console.log(`[server]   WhatsPlaying webhook path: ${config.whatsPlayingWebhookPath}`)
  console.log(`[server] Watching user(s): ${config.watchedUsers.join(', ') || '(none configured)'}`)
  console.log(`[server] Watching device(s): ${config.watchedDevices.join(', ') || '(none — all devices allowed)'}`)
})

// Optional second source - only starts if Spotify credentials are configured,
// so existing Plex-only setups are completely unaffected.
if (config.spotifyClientId && config.spotifyClientSecret) {
  console.log('[server] Spotify polling enabled.')
  startSpotifyPolling(handleNowPlayingEvent, config)
} else {
  console.log('[server] Spotify polling disabled (SPOTIFY_CLIENT_ID/SECRET not set).')
}
