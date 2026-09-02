// Parses a JSON body POSTed by the WhatsPlaying Android app into a normalized
// now-playing event. Unlike parsePlexWebhook, the app already sends the
// { kind, mediaType, title, subtitle, username, deviceName } shape directly
// (it has no richer source-specific format to translate), so this just
// validates it rather than reshaping it.
export function parseWhatsPlayingPayload(body) {
  if (!body || typeof body !== 'object') return null

  const { kind, username, deviceName } = body
  if (kind !== 'playing' && kind !== 'stopped') return null

  if (kind === 'stopped') return { kind, username: username || '', deviceName: deviceName || '' }

  const { mediaType, title, subtitle } = body
  if (!title) return null

  return {
    kind,
    mediaType: mediaType || 'track',
    title,
    subtitle: subtitle || '',
    username: username || '',
    deviceName: deviceName || '',
  }
}
