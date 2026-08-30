// Spotify has no push webhook for personal accounts - only a pollable
// "what's playing" endpoint under OAuth - so unlike sources/plex.js this
// module owns an active polling loop, not just a payload parser. It still
// produces the same { kind, mediaType, title, subtitle, username, deviceName }
// shape into the callback (handleNowPlayingEvent in server.js) so the
// WATCHED_USERS/WATCHED_DEVICES filtering there applies unchanged.
import { refreshAccessToken } from '../spotifyAuth.js'

const SUPPORTED_TYPES = ['track', 'episode']

function subtitleFor(item) {
  if (item.type === 'track') return (item.artists || []).map((a) => a.name).join(', ')
  if (item.type === 'episode') return item.show?.name || ''
  return ''
}

function normalize(playbackState, username) {
  const deviceName = playbackState?.device?.name || ''

  // Ads (on free-tier playback) and anything without a real item are treated
  // the same as "nothing playing" - there's no "now playing" worth showing.
  const type = playbackState?.item?.type
  if (
    !playbackState?.is_playing ||
    !playbackState.item ||
    !SUPPORTED_TYPES.includes(type) ||
    playbackState.currently_playing_type === 'ad'
  ) {
    return { kind: 'stopped', username, deviceName }
  }

  return {
    kind: 'playing',
    mediaType: type,
    title: playbackState.item.name || 'Unknown',
    subtitle: subtitleFor(playbackState.item),
    username,
    deviceName,
  }
}

// Only forward an event when something a listener would actually notice has
// changed - otherwise every single poll tick of the same song still playing
// would reconnect to WhatsApp and re-push the same status for no reason.
function sameState(a, b) {
  if (!a || !b || a.kind !== b.kind) return false
  if (a.kind === 'stopped') return true
  return a.title === b.title && a.subtitle === b.subtitle && a.deviceName === b.deviceName
}

async function fetchPlaybackState(accessToken) {
  const res = await fetch('https://api.spotify.com/v1/me/player', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (res.status === 204) return null // nothing playing / no active device

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const err = new Error(`Spotify playback-state request failed (${res.status})`)
    err.status = res.status
    err.body = body
    const retryAfter = res.headers.get('Retry-After')
    if (retryAfter) err.retryAfterSec = Number(retryAfter)
    throw err
  }

  return res.json()
}

// Starts an indefinite self-rescheduling poll loop (setTimeout, not
// setInterval, so a slow request or a backoff delay doesn't overlap with
// the next tick). Returns nothing - this runs for the lifetime of the
// process, same as the Express server it's started alongside in server.js.
export function startSpotifyPolling(onEvent, cfg) {
  const {
    spotifyClientId: clientId,
    spotifyClientSecret: clientSecret,
    spotifyTokenPath: tokenPath,
    spotifyPollIntervalMs: activeIntervalMs,
    spotifyIdlePollIntervalMs: idleIntervalMs,
    watchedUsers,
  } = cfg
  const watchedUsersLower = watchedUsers.map((u) => u.toLowerCase())

  let accessToken = null
  let accessTokenExpiresAt = 0
  let username = ''
  let lastState = null

  async function ensureAccessToken() {
    if (accessToken && Date.now() < accessTokenExpiresAt) return accessToken
    const { accessToken: token, expiresInSec } = await refreshAccessToken({ clientId, clientSecret, tokenPath })
    accessToken = token
    // Refresh a bit early (60s margin) rather than cutting it exactly at expiry.
    accessTokenExpiresAt = Date.now() + (expiresInSec - 60) * 1000
    // A genuinely fresh access token might belong to a different linked
    // account - e.g. spotify-token.json got overwritten by re-running
    // npm run link:spotify for someone else while this process kept
    // running. Re-resolve the display name alongside it rather than
    // trusting a cache that could now be stale for a different person.
    username = ''
    return accessToken
  }

  async function ensureUsername(token) {
    if (username) return username
    const me = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json())
    username = me.display_name || me.id || ''
    return username
  }

  async function poll() {
    let nextDelayMs = idleIntervalMs

    try {
      const token = await ensureAccessToken()
      const who = await ensureUsername(token)

      // No point spending Spotify's undocumented quota polling an account
      // that can never pass WATCHED_USERS anyway - check before, not after,
      // fetching playback state, and stop rescheduling entirely rather than
      // silently polling forever for nothing.
      if (!watchedUsersLower.includes(who.toLowerCase())) {
        console.log(
          `[spotify] Linked account "${who}" is not in WATCHED_USERS - stopping Spotify polling. ` +
            'Add it to .env and restart the service to enable.',
        )
        return
      }

      const playbackState = await fetchPlaybackState(token)
      const event = normalize(playbackState, who)

      if (!sameState(event, lastState)) {
        onEvent(event)
        lastState = event
      }
      nextDelayMs = event.kind === 'playing' ? activeIntervalMs : idleIntervalMs
    } catch (err) {
      if (err.status === 401) {
        // Access token was rejected despite our own expiry tracking (e.g.
        // revoked) - drop it so the next cycle forces a fresh refresh.
        accessToken = null
        console.error('[spotify] Access token rejected, will refresh and retry next poll.')
      } else if (err.status === 429) {
        // Spotify doesn't document the exact reset window for quota
        // exhaustion (only that it's distinct from a plain rate limit) - an
        // hour is a conservative guess to back off by, not a documented value.
        const quotaExceeded = err.body?.reason === 'QUOTA_EXCEEDED' || err.body?.error?.reason === 'QUOTA_EXCEEDED'
        nextDelayMs = quotaExceeded ? 60 * 60 * 1000 : (err.retryAfterSec ? err.retryAfterSec * 1000 : idleIntervalMs)
        console.error(
          `[spotify] ${quotaExceeded ? 'Quota exceeded' : 'Rate limited'} - pausing polling for ` +
            `${Math.round(nextDelayMs / 1000)}s.`,
        )
      } else {
        console.error('[spotify] Poll failed, will retry next cycle:', err.message || err)
      }
    }

    setTimeout(poll, nextDelayMs)
  }

  poll()
}
