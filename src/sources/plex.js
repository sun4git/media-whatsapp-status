const SUPPORTED_MEDIA_TYPES = ['track', 'movie', 'episode']

function subtitleFor(mediaType, metadata) {
  if (mediaType === 'movie') return metadata.year ? String(metadata.year) : ''
  // track -> artist, episode -> show name: both live in grandparentTitle
  return metadata.grandparentTitle || metadata.originalTitle || ''
}

// Parses a Plex webhook's multipart "payload" field into a normalized
// now-playing event. Keeping Plex's own event/field names isolated here means
// a future source (e.g. a Spotify polling module) only needs to produce the
// same { kind: 'playing', mediaType, title, subtitle } / { kind: 'stopped' }
// shape to plug into the same formatter/queue/whatsapp pipeline.
export function parsePlexWebhook(rawPayloadJson, watchedUsers) {
  let payload
  try {
    payload = JSON.parse(rawPayloadJson)
  } catch {
    return null
  }

  const { event, Account, Metadata } = payload
  if (!Metadata || !SUPPORTED_MEDIA_TYPES.includes(Metadata.type)) return null
  if (!Account?.title || !watchedUsers.includes(Account.title.toLowerCase())) return null

  if (event === 'media.play' || event === 'media.resume') {
    return {
      kind: 'playing',
      mediaType: Metadata.type,
      title: Metadata.title || 'Unknown',
      subtitle: subtitleFor(Metadata.type, Metadata),
    }
  }

  if (event === 'media.pause' || event === 'media.stop') {
    return { kind: 'stopped' }
  }

  return null
}
