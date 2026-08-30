// One-time OAuth linking step for the Spotify source. Unlike Plex (a push
// webhook needing no per-account auth), Spotify requires each account to
// individually grant OAuth consent before sources/spotify.js can poll on
// its behalf - this script does that once and saves a refresh token.
//
// Usage: npm run link:spotify
//
// Spotify's server only ever redirects the *browser* that completes the
// consent screen - it never calls SPOTIFY_REDIRECT_URI itself - so that
// redirect target doesn't need to be reachable. Open the printed URL in any
// browser (it doesn't have to be this machine), approve, and paste back
// whatever URL the browser lands on afterward even though that page itself
// fails to load - the authorization code is in its address bar regardless.
import readline from 'readline'
import { config } from './config.js'
import { exchangeCodeForTokens, saveRefreshToken } from './spotifyAuth.js'

const SCOPES = 'user-read-playback-state user-read-currently-playing'

function requireConfig() {
  const missing = ['spotifyClientId', 'spotifyClientSecret', 'spotifyRedirectUri'].filter((k) => !config[k])
  if (missing.length) {
    console.error(`[link-spotify] Missing required .env value(s): ${missing.join(', ')}`)
    process.exit(1)
  }
}

function extractCode(pasted) {
  const trimmed = pasted.trim()
  try {
    const code = new URL(trimmed).searchParams.get('code')
    if (code) return code
  } catch {
    // Not a URL - assume the bare code itself was pasted.
  }
  return trimmed
}

async function promptForPastedUrl() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((resolve) => rl.question('\nPaste the redirect URL (or just the code): ', resolve))
  rl.close()
  return answer
}

async function main() {
  requireConfig()

  const authUrl = new URL('https://accounts.spotify.com/authorize')
  authUrl.searchParams.set('client_id', config.spotifyClientId)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('redirect_uri', config.spotifyRedirectUri)
  authUrl.searchParams.set('scope', SCOPES)

  console.log('[link-spotify] Open this URL in any browser and log in as the Spotify account to link:\n')
  console.log(authUrl.toString())
  console.log(
    '\n[link-spotify] After approving, the browser will redirect to a page that fails to load - ' +
      'that\'s expected, nothing needs to be listening there. Copy that page\'s full URL from the ' +
      'address bar (or just the "code" value in it) and paste it below.',
  )

  const code = extractCode(await promptForPastedUrl())
  if (!code) {
    console.error('[link-spotify] Could not find a code in what was pasted.')
    process.exit(1)
  }

  try {
    const tokens = await exchangeCodeForTokens(code, {
      clientId: config.spotifyClientId,
      clientSecret: config.spotifyClientSecret,
      redirectUri: config.spotifyRedirectUri,
    })
    saveRefreshToken(config.spotifyTokenPath, tokens.refresh_token)

    const me = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    }).then((r) => r.json())

    console.log(`\n[link-spotify] Linked Spotify account: ${me.display_name || me.id}`)
    console.log(`[link-spotify] Refresh token saved to ${config.spotifyTokenPath}`)
    console.log('[link-spotify] Keep that file private and do not commit it - same as auth/ for WhatsApp.')
  } catch (err) {
    console.error('[link-spotify] Failed to link:', err.message || err)
    process.exit(1)
  }
}

main()
