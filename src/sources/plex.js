const SUPPORTED_MEDIA_TYPES = ['track', 'movie', 'episode']

function subtitleFor(mediaType, metadata) {
  if (mediaType === 'movie') return metadata.year ? String(metadata.year) : ''
  // track artist (originalTitle) takes priority over album artist (grandparentTitle)
  if (mediaType === 'track') return metadata.originalTitle || metadata.grandparentTitle || ''
  // episode -> show name lives in grandparentTitle
  return metadata.grandparentTitle || ''
}

// Parses a Plex webhook's multipart "payload" field into a normalized
// now-playing event. Keeping Plex's own event/field names isolated here means
// a future source (e.g. a Spotify polling module) only needs to produce the
// same { kind, mediaType, title, subtitle, username, deviceName } shape to
// plug into the same formatter/queue/whatsapp pipeline. This function only
// parses and normalizes - it doesn't apply watchedUsers/watchedDevices
// filtering itself; that's done centrally in server.js so every source
// shares one filter implementation instead of each re-checking it.
export function parsePlexWebhook(rawPayloadJson) {
  let payload
  try {
    payload = JSON.parse(rawPayloadJson)
  } catch {
    return null
  }

  const { event, Account, Metadata, Player } = payload
  if (!Metadata || !SUPPORTED_MEDIA_TYPES.includes(Metadata.type)) return null

  const username = Account?.title || ''
  const deviceName = Player?.title || ''

  if (event === 'media.play' || event === 'media.resume') {
    return {
      kind: 'playing',
      mediaType: Metadata.type,
      title: Metadata.title || 'Unknown',
      subtitle: subtitleFor(Metadata.type, Metadata),
      username,
      deviceName,
    }
  }

  if (event === 'media.pause' || event === 'media.stop') {
    return { kind: 'stopped', username, deviceName }
  }

  return null
}
