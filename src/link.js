// One-off helper to perform the initial WhatsApp QR link (or verify an
// existing session still works) without needing to play a real Plex track.
// Usage: npm run link ["custom status text"]
import { config } from './config.js'
import { pushStatus } from './whatsappClient.js'

const text = process.argv[2] || 'media-whatsapp-status linked'

pushStatus(
  { text, emoji: '🎧', durationSec: config.trackDurationSec },
  { authDir: config.authDir, idleDisconnectMs: 2000 },
)
  .then(() => {
    console.log('[link] Status updated successfully - WhatsApp link is working.')
    process.exit(0)
  })
  .catch((err) => {
    console.error('[link] Failed to link / update status:', err)
    process.exit(1)
  })
