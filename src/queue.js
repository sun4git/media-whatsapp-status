import { pushStatus } from './whatsappClient.js'

let pendingStatus = null
let debounceTimer = null

// Coalesces bursts of rapid Plex events (e.g. skipping through several tracks)
// into a single WhatsApp connect/update/disconnect cycle using only the latest state.
// statusPayload: { text, emoji, durationSec } - see whatsappClient.js for why
// emoji/duration are separate fields rather than baked into text.
export function scheduleStatusUpdate(statusPayload, { debounceMs, authDir, idleDisconnectMs }) {
  pendingStatus = statusPayload
  if (debounceTimer) clearTimeout(debounceTimer)

  debounceTimer = setTimeout(async () => {
    const toSend = pendingStatus
    pendingStatus = null
    try {
      await pushStatus(toSend, { authDir, idleDisconnectMs })
      console.log(`[queue] WhatsApp status updated: ${toSend.emoji} ${toSend.text}`.trim())
    } catch (err) {
      console.error('[queue] Failed to update WhatsApp status:', err)
    }
  }, debounceMs)
}
