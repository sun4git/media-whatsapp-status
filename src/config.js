import 'dotenv/config'

function parseList(value) {
  return (value || '').split(',').map((s) => s.trim()).filter(Boolean)
}

export const config = {
  port: parseInt(process.env.PORT || '8090', 10),
  plexWebhookPath: process.env.PLEX_WEBHOOK_PATH || '/webhook/plex',
  watchedUsers: parseList(process.env.WATCHED_USERS),
  // Optional, unlike watchedUsers above: an empty list means "don't filter by
  // device at all," not "match nobody." Matched case-insensitively against
  // the webhook's Player.title (the device/client name Plex itself assigns,
  // which can contain spaces, e.g. "Suneel's iPhone").
  watchedDevices: parseList(process.env.WATCHED_DEVICES),
  debounceMs: parseInt(process.env.DEBOUNCE_MS || '2500', 10),
  idleDisconnectMs: parseInt(process.env.IDLE_DISCONNECT_MS || '10000', 10),
  clearStatusOnStop: (process.env.CLEAR_STATUS_ON_STOP || 'true').toLowerCase() === 'true',
  idleStatusText: process.env.IDLE_STATUS_TEXT || '',
  // Duration for the pause/stop fallback text specifically. Confirmed by
  // testing: 60s actually takes effect (expires on schedule) - no documented
  // minimum exists, but this value is now known-good, not a guess.
  idleDurationSec: parseInt(process.env.IDLE_DURATION_SEC || '60', 10),
  // Confirmed by testing: an empty emoji field causes WhatsApp to silently
  // ignore the whole update (same as an empty text field does) - always pass
  // a non-empty emoji, even for a generic/idle status with no natural icon.
  idleEmoji: process.env.IDLE_EMOJI || '💤',
  authDir: process.env.AUTH_DIR || './auth',
  // Duration is seconds until WhatsApp auto-expires the About text on its own
  // - a safety net if a stop/pause webhook is ever missed. Requires the
  // Baileys fork with PR #2755's duration support; has no effect on stable
  // Baileys. Split by media kind since a song and a movie/episode run very
  // different lengths.
  trackEmoji: process.env.TRACK_EMOJI || '🎵',
  trackDurationSec: parseInt(process.env.TRACK_DURATION_SEC || '600', 10),
  videoEmoji: process.env.VIDEO_EMOJI || '🎬',
  videoDurationSec: parseInt(process.env.VIDEO_DURATION_SEC || '5400', 10),
}

if (config.watchedUsers.length === 0) {
  console.warn('[config] WATCHED_USERS is empty in .env — no playback events will match anyone.')
}
