# Hebrew lyrics for Spotify

A static site that shows the Hebrew lyrics and an English translation of whatever is playing on your Spotify account, with both texts filling in green as the song advances. Works on GitHub Pages with no backend.

## 1. Put it on GitHub Pages

1. Create a new public repo on GitHub (for example `hebrew-lyrics`).
2. Upload `index.html`, `songs.json` and this `README.md` to the root of the repo.
3. Repo → Settings → Pages → Source: "Deploy from a branch", branch `main`, folder `/ (root)`. Save.
4. After a minute your site is live at `https://YOUR-USERNAME.github.io/hebrew-lyrics/` (note the trailing slash).

## 2. Create a Spotify app

1. Go to https://developer.spotify.com/dashboard and log in with your Spotify account.
2. Create an app. Any name works. Under "Redirect URIs" add **exactly** the address of your site, e.g. `https://YOUR-USERNAME.github.io/hebrew-lyrics/` (the site's Settings page shows the exact string to paste). Tick "Web API". Save.
3. Copy the **Client ID** (you do not need the client secret).
4. Open your site → Settings → paste the Client ID → "Save and connect Spotify". Log in and approve.

Notes:
- Reading what's playing works with any Spotify account. The Play/Pause button on the site needs Spotify Premium.
- Spotify apps start in "development mode": only the account that created the app (plus up to 5 users you add in the dashboard) can log in; the app owner needs Spotify Premium. That's fine for personal use.
- Play music in any Spotify app (phone, desktop, web) — the site just follows along.

## 3. Lyrics and translation (automatic)

When a song without lyrics starts, the site looks it up on [LRCLIB](https://lrclib.net) (a free, open lyrics database — many entries include line timings) and translates the Hebrew with the service chosen in Settings:

- **Claude** — paste an Anthropic API key (console.anthropic.com). Best quality.
- **OpenAI** — paste an OpenAI API key.
- **MyMemory** — free, no key, noticeably rougher.

The key is stored only in your browser's local storage and sent only to that provider. Fetched songs are also cached in the browser, so they load instantly next time on the same device. To share a song across devices, open Sync lyrics → "Fetch Hebrew lyrics" → "Translate" → "Use fetched timings" and commit the JSON it shows into `songs.json`.

If LRCLIB doesn't have the song (or has it without timings), the Sync lyrics page lets you paste the Hebrew, translate it, and tap **Now** / Space at the start of each line to time it.

`songs.json` format — one entry per Spotify track ID:

```json
{
  "3n3Ppam7vgaVa1iaRUc9Lp": {
    "title": "Song title",
    "artist": "Artist",
    "lines": [
      { "t": 12.4, "he": "שורה בעברית", "en": "The line in English" },
      { "t": 16.0, "he": "…", "en": "…", "end": 19.5 }
    ]
  }
}
```

- `t` is the start time of the line in seconds.
- A line fills from its `t` until the next line's `t`. Add `"end"` to stop the fill earlier (useful before an instrumental break or on the last line).
- The track ID is the part after `track/` in a Spotify share link, e.g. `https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp`.
- If the lyrics run slightly early or late, use the per-song offset in Settings.

The included sample is Hatikvah (public domain). Its timings are placeholders — replace `REPLACE_WITH_SPOTIFY_TRACK_ID` with the ID of whichever recording you use and retime it with the sync editor. "Try a demo without Spotify" on the home screen plays the first song in `songs.json` on a local timer so you can see the effect before connecting.
