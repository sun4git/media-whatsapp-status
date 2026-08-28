// WhatsApp's About field has a hard length limit around 139 characters.
const MAX_STATUS_LENGTH = 139

export function formatNowPlaying({ title, artist }) {
  const text = artist ? `🎵 ${title} — ${artist}` : `🎵 ${title}`
  return text.length > MAX_STATUS_LENGTH ? `${text.slice(0, MAX_STATUS_LENGTH - 1)}…` : text
}
