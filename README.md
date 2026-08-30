# media-whatsapp-status

Listens for playback webhooks and updates a WhatsApp account's **About text**
(the short persistent profile bio, *not* the 24-hour Status/Stories feature)
with the track currently playing, for one or more configured usernames.
Fully independent of `mediasage` and `smart-plex-queue` — its own dependencies,
its own WhatsApp session, no shared code or process.

Plex is the only supported source right now. The `src/sources/` folder exists
so another push-based source could plug into the same pipeline later, but see
the note at the bottom before assuming that's a small addition for every
service.

## About text vs. WhatsApp Status - why this matters

WhatsApp has two different features that share confusing names:

- **Status** (the "Updates" tab): Stories-style posts that auto-expire after
  24 hours and appear in your contacts' feed. Posting one is a heavier
  operation (sending a message to a special broadcast address).
- **About**: a short, persistent text line under your name in your profile
  info (defaults to "Hey there! I am using WhatsApp."). It just stays until
  changed again.

This project updates **About** — right for a continuously-refreshed
"now playing" line. It does **not** post to Status/Stories, which would spam
your contacts with a new expiring story every few minutes. The `updateProfileStatus()`
call this code uses (in `src/whatsappClient.js`) targets the About field
specifically, despite the "status" naming.

WhatsApp redesigned About sometime around mid-2026: it's no longer just a
plain text line. The editor now also has a **duration** ("1 day", etc.) and
an **audience** ("Everyone", etc.) picker, alongside a "Suggestions" quick-set
list — which is exactly why this project's `TRACK_DURATION_SEC` /
`VIDEO_DURATION_SEC` / `IDLE_DURATION_SEC` settings (and the mandatory
`emoji` argument) exist and matter now, where the old plain-text About didn't
have a duration concept at all:

<img src="docs/screenshots/about-edit-screen.png" alt="WhatsApp's About-editing screen, showing a text field, a 1-day duration picker, an Everyone audience picker, and suggested statuses like Away/Sleeping/At work" width="360">

Once set, contacts see it as a **speech-bubble**, not plain text under your
name — both on your profile page:

<img src="docs/screenshots/contact-profile-bubble.png" alt="A contact's profile page showing a speech bubble reading a now-playing track, above the avatar and name" width="360">

...and in the header of an open chat with you:

<img src="docs/screenshots/chat-header-bubble.png" alt="An open chat's header showing the avatar, name, and the same now-playing speech bubble beneath it" width="360">

So in practice: this service sets your About text/emoji/duration via
`updateProfileStatus()`, and WhatsApp itself renders that as a bubble
wherever a contact views your profile or chat header — no separate
Status/Story post is ever created.

## How it works

- Registers as a **second** Plex webhook URL alongside whatever `smart-plex-queue`
  already uses. Plex POSTs every event to both independently.
- `src/sources/plex.js` filters events to `media.play` / `media.resume` /
  `media.pause` / `media.stop` on `Metadata.type` of `track`, `movie`, or
  `episode`, and normalizes them to
  `{ kind: 'playing', mediaType, title, subtitle, username, deviceName }` /
  `{ kind: 'stopped', username, deviceName }`.
- `src/server.js` then applies `WATCHED_USERS` / `WATCHED_DEVICES` centrally
  (so a future source doesn't need to re-implement the same filter) before
  doing anything else with the event. `WATCHED_USERS` is required - an empty
  list matches nobody. `WATCHED_DEVICES` is optional - an empty list means no
  device restriction; when set, both the user AND the device must match.
- `src/server.js` picks emoji/duration by `mediaType` (tracks get short
  music-length defaults, movies/episodes get long-form-video defaults),
  debounces bursts of events (e.g. skipping tracks), and only then connects to
  WhatsApp, sets the About text, and disconnects again - it does **not** hold
  a permanent WhatsApp connection open.

## Prerequisites (Ubuntu listener box)

- Node.js and npm (already present on this box).
- `build-essential` and `python3` if not already installed, in case a native
  module needs compiling during `npm install`:
  ```bash
  sudo apt-get update && sudo apt-get install -y build-essential python3
  ```
- Outbound internet access from this box (not just LAN) - it connects
  directly to WhatsApp's servers.
- A phone with the target WhatsApp account installed, for the one-time QR
  link.

## Known issue: About updates need an unmerged Baileys fork

As of testing this in August 2026, stable `baileys`'s `updateProfileStatus()`
sends About updates using an old protocol path that WhatsApp's servers
silently ignore - the call succeeds with no error, but nothing changes on
WhatsApp. This is WhiskeySockets/Baileys issue #2727 ("WhatsApp's new About
update"); the fix is open PR #2755, unmerged and flagged stale as of
2026-08-23, available only from the author's fork branch. This project's code
already calls `updateProfileStatus(text, emoji, durationSec)` - the new
3-argument signature that PR introduces - so you need that fork installed,
not the registry package, for About updates to actually work.

Since this is unreviewed, untested-by-maintainers code running against your
real linked WhatsApp session, treat it as an experiment: check back on
[PR #2755](https://github.com/WhiskeySockets/Baileys/pull/2755) periodically
and switch to the real `baileys` release once it merges.

**Confirmed by testing (not just the PR's own claims):** an empty `emoji`
argument causes WhatsApp to silently ignore the whole update, the same as an
empty `text` does. Always pass a non-empty emoji, even for a generic/idle
status with no natural icon - that's why `IDLE_EMOJI` defaults to 💤 rather
than being left blank.

## Install

```bash
cd ~/media-whatsapp-status   # wherever you copy this project on the Ubuntu box
npm install express multer dotenv pino qrcode-terminal
npm install baileys@github:ayusc/Baileys#9a469c7
cp .env.example .env
```

After installing, verify the fork actually has the signature this code
expects before relying on it - I pieced this together from a summarized diff,
not verified source:
```bash
grep -n "updateProfileStatus" node_modules/baileys/lib/Socket/*.js
```
It should show a function accepting three parameters (status, emoji,
duration), not just one. If it doesn't match, the call in
`src/whatsappClient.js` will need adjusting to whatever the real signature is.

Edit `.env`:
- `WATCHED_USERS` - your Plex account username (as it appears in
  `Account.title` on the webhook payload).
- `WATCHED_DEVICES` - optional. Leave empty to allow any device. To restrict,
  list the Plex client/device name(s) exactly as Plex shows them (e.g. under
  Settings -> Devices, or in `Player.title` on the webhook payload) -
  comma-separated, spaces inside a name are fine.
- `PORT` - pick a free port on this box (default `8090`; `mediasage` uses
  `5765`, `smart-plex-queue` uses `8000` elsewhere, so this shouldn't clash).
- Leave the rest at their defaults for a first test.

## Link WhatsApp (one-time)

Run this in the foreground so you can see the QR code:

```bash
npm run link
```

Scan it from your phone: WhatsApp -> Settings -> Linked Devices -> Link a
Device. On success it prints `Status updated successfully` and exits. Your
WhatsApp About text should now briefly show "media-whatsapp-status linked".

The session is saved under `./auth` (path from `AUTH_DIR` in `.env`). Keep
that folder private and don't commit it - anyone with it can act as your
linked device.

## Run it

```bash
npm start
```

You should see:
```
[server] Listening on port 8090
[server]   Plex webhook path: /webhook/plex
[server] Watching user(s): YourPlexUsername
```

## Point Plex at it

Plex Settings -> Webhooks -> Add Webhook (requires Plex Pass):
```
http://<this-box-ip>:8090/webhook/plex
```
This is **in addition to** the existing webhook URL `smart-plex-queue` uses -
don't replace that one, just add this as a second entry. Plex will POST the
same event to both.

## Test

1. With `npm start` running in the foreground, play a track in Plex under the
   watched account.
2. Watch the terminal - after `DEBOUNCE_MS` (default 2.5s) you should see
   `[queue] WhatsApp status updated: 🎵 <track> — <artist>`.
3. Check the About text on your WhatsApp profile from another device/contact
   view.
4. Pause/stop playback - if `CLEAR_STATUS_ON_STOP=true` (the default), confirm
   it resets to `IDLE_STATUS_TEXT` after the debounce window; if set `false`,
   the last status simply stays as-is.
5. Try skipping through a few tracks quickly - confirm only one status update
   fires for the final track, not one per skip.

## Run persistently (after testing works)

Either `pm2`:
```bash
npm install -g pm2
pm2 start src/server.js --name media-whatsapp-status
pm2 save
```

Or a systemd unit, e.g. `/etc/systemd/system/media-whatsapp-status.service`:
```ini
[Unit]
Description=Media -> WhatsApp status updater
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/<your-user>/media-whatsapp-status
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
User=<your-user>

[Install]
WantedBy=multi-user.target
```
Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now media-whatsapp-status
```

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Nothing logs when you play a track | `WATCHED_USERS` doesn't match `Account.title` exactly (check casing/spelling); if `WATCHED_DEVICES` is set, it also must match `Player.title` exactly (both filters must pass); or the webhook URL registered in Plex is wrong/missing |
| `[whatsapp] Session was logged out...` | The phone unlinked the device, or WhatsApp invalidated the session. Delete the `auth/` folder and run `npm run link` again |
| Status never updates but no errors | `Metadata.type` isn't `"track"` for what you played (e.g. you tested with a movie) |
| Multiple rapid updates on track skip | `DEBOUNCE_MS` too low - increase it |

## Adding another source later

Plex has a genuine push-webhook model, which is why this architecture is a
clean webhook receiver. **Spotify and Amazon Music don't offer an equivalent
for personal accounts** - Spotify only exposes "currently playing" via
polling `/me/player/currently-playing` under OAuth, not a push webhook, and
Amazon Music has no public developer API for this at all as far as I'm aware.
So a future Spotify source would be a small poller calling their API on an
interval and feeding the same
`{ kind: 'playing'/'stopped', mediaType, title, subtitle, username, deviceName }`
shape into `handleNowPlayingEvent` in `src/server.js` - not another webhook
route. `username`/`deviceName` matter there too: `WATCHED_USERS`/`WATCHED_DEVICES`
filtering happens centrally in `server.js`, so a Spotify source gets both
filters for free as long as it fills in those two fields (from Spotify's
`/me` display name and the `device.name` field on `/me/player`) - no need to
re-implement the filter. Worth confirming against Spotify's current developer
docs before building it, since API terms/availability change.
