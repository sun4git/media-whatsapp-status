// Parses a Plex webhook's multipart "payload" field into a normalized
// now-playing event. Keeping Plex's own event/field names isolated here means
// a future source (e.g. a Spotify polling module) only needs to produce the
// same { kind: 'playing', title, artist } / { kind: 'stopped' } shape to
// plug into the same formatter/queue/whatsapp pipeline.
export function parsePlexWebhook(rawPayloadJson, watchedUsers) {
  let payload
  try {
    payload = JSON.parse(rawPayloadJson)
  } catch {
    return null
  }

  const { event, Account, Metadata } = payload
  if (!Metadata || Metadata.type !== 'track') return null
  if (!Account?.title || !watchedUsers.includes(Account.title.toLowerCase())) return null

  if (event === 'media.play' || event === 'media.resume') {
    return {
      kind: 'playing',
      title: Metadata.title || 'Unknown track',
      artist: Metadata.grandparentTitle || Metadata.originalTitle || '',
    }
  }

  if (event === 'media.pause' || event === 'media.stop') {
    return { kind: 'stopped' }
  }

  return null
}
