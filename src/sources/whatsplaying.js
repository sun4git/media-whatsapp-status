// Parses a JSON body POSTed by the WhatsPlaying Android app into a normalized
// now-playing event. Unlike parsePlexWebhook, the app already sends the
// { kind, mediaType, title, subtitle, deviceName } shape directly (it has no
// richer source-specific format to translate), so this just validates it
// rather than reshaping it. No username here, unlike Plex/Spotify - this
// source is inherently single-account (one phone, one server instance, one
// WhatsApp session), so there's nothing for WATCHED_USERS to disambiguate;
// server.js calls handleNowPlayingEvent with requireUser: false for this path.
export function parseWhatsPlayingPayload(body) {
  if (!body || typeof body !== 'object') return null

  const { kind, deviceName } = body
  if (kind !== 'playing' && kind !== 'stopped') return null

  if (kind === 'stopped') return { kind, deviceName: deviceName || '' }

  const { mediaType, title, subtitle } = body
  if (!title) return null

  return {
    kind,
    mediaType: mediaType || 'track',
    title,
    subtitle: subtitle || '',
    deviceName: deviceName || '',
  }
}
