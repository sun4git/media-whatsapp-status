import 'dotenv/config'

function parseList(value) {
  return (value || '').split(',').map((s) => s.trim()).filter(Boolean)
}

export const config = {
  port: parseInt(process.env.PORT || '8090', 10),
  plexWebhookPath: process.env.PLEX_WEBHOOK_PATH || '/webhook/plex',
  watchedUsers: parseList(process.env.WATCHED_USERS),
  debounceMs: parseInt(process.env.DEBOUNCE_MS || '2500', 10),
  idleDisconnectMs: parseInt(process.env.IDLE_DISCONNECT_MS || '10000', 10),
  clearStatusOnStop: (process.env.CLEAR_STATUS_ON_STOP || 'false').toLowerCase() === 'true',
  defaultStatusText: process.env.DEFAULT_STATUS_TEXT || '',
  authDir: process.env.AUTH_DIR || './auth',
}

if (config.watchedUsers.length === 0) {
  console.warn('[config] WATCHED_USERS is empty in .env — no playback events will match anyone.')
}
