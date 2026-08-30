// Shared OAuth token handling for the Spotify source - used by both the
// one-time link-spotify.js script (authorization_code grant) and the
// poller in sources/spotify.js (refresh_token grant on every cycle, since
// access tokens only last ~1 hour and this process runs indefinitely).
import fs from 'fs'

const TOKEN_URL = 'https://accounts.spotify.com/api/token'

function basicAuthHeader(clientId, clientSecret) {
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
}

async function postToken(params, clientId, clientSecret) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(clientId, clientSecret),
    },
    body: new URLSearchParams(params),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Spotify token request failed (${res.status}): ${JSON.stringify(body)}`)
  }
  return body
}

// One-time exchange of the authorization code from the OAuth consent
// redirect (see link-spotify.js) for an initial refresh token.
export async function exchangeCodeForTokens(code, { clientId, clientSecret, redirectUri }) {
  return postToken({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }, clientId, clientSecret)
}

export function saveRefreshToken(tokenPath, refreshToken) {
  fs.writeFileSync(
    tokenPath,
    JSON.stringify({ refresh_token: refreshToken, saved_at: new Date().toISOString() }, null, 2),
  )
}

// Exchanges the saved refresh token for a fresh access token. Spotify's
// refresh_token grant doesn't always return a new refresh_token - only
// overwrite the saved one on disk when it actually does.
export async function refreshAccessToken({ clientId, clientSecret, tokenPath }) {
  let saved
  try {
    saved = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'))
  } catch {
    throw new Error(
      `Could not read Spotify refresh token from ${tokenPath} - run "npm run link:spotify" first.`,
    )
  }

  const body = await postToken(
    { grant_type: 'refresh_token', refresh_token: saved.refresh_token },
    clientId,
    clientSecret,
  )

  if (body.refresh_token) {
    saveRefreshToken(tokenPath, body.refresh_token)
  }

  return { accessToken: body.access_token, expiresInSec: body.expires_in }
}
