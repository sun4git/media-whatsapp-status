import { pushStatus } from './whatsappClient.js'

let pendingText = null
let debounceTimer = null

// Coalesces bursts of rapid Plex events (e.g. skipping through several tracks)
// into a single WhatsApp connect/update/disconnect cycle using only the latest state.
export function scheduleStatusUpdate(text, { debounceMs, authDir, idleDisconnectMs }) {
  pendingText = text
  if (debounceTimer) clearTimeout(debounceTimer)

  debounceTimer = setTimeout(async () => {
    const toSend = pendingText
    pendingText = null
    try {
      await pushStatus(toSend, { authDir, idleDisconnectMs })
      console.log(`[queue] WhatsApp status updated: ${toSend}`)
    } catch (err) {
      console.error('[queue] Failed to update WhatsApp status:', err)
    }
  }, debounceMs)
}
