// WhatsApp's new About text field is limited to 50 Unicode characters
// (per WhiskeySockets/Baileys PR #2755, which also fixes the emoji/duration
// handling this project depends on). Emoji is a separate field from the
// text - see whatsappClient.js - so it isn't prefixed in here.
const MAX_STATUS_LENGTH = 50

export function formatNowPlaying({ title, subtitle }) {
  const text = subtitle ? `${title} — ${subtitle}` : title
  return text.length > MAX_STATUS_LENGTH ? `${text.slice(0, MAX_STATUS_LENGTH - 1)}…` : text
}
