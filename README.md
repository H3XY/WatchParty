# 🎬 WatchParty

Watch any streaming service in sync with up to 3 friends. Built with Node.js, Socket.io, and a Chrome/Edge Extension.

---

## Project Structure

```
watchparty/
├── server/          ← Node.js + Socket.io backend
│   ├── server.js
│   └── package.json
├── extension/       ← Chrome/Edge browser extension
│   ├── manifest.json
│   ├── background.js
│   ├── popup/
│   │   ├── popup.html
│   │   └── popup.js
│   ├── content/
│   │   ├── content.js   ← Video sync + overlay
│   │   └── overlay.css
│   └── lib/
│       └── socket.io.min.js  ← (you must add this — see step 2)
└── webapp/          ← Guest join page (static HTML)
    └── index.html
```

---

## ⚡ Quick Start

### Step 1 — Start the server

```bash
cd server
npm install
npm start
# Server runs on http://localhost:3000
```

For development with auto-restart:
```bash
npm run dev
```

### Step 2 — Add socket.io client to the extension

Download the socket.io browser bundle and place it in `extension/lib/`:

```bash
curl -o extension/lib/socket.io.min.js \
  https://cdn.socket.io/4.7.2/socket.io.min.js
```

Or download it manually from: https://cdn.socket.io/4.7.2/socket.io.min.js

### Step 3 — Load the extension

1. Open Chrome or Edge
2. Go to `chrome://extensions` (or `edge://extensions`)
3. Enable **Developer Mode** (top right toggle)
4. Click **Load unpacked**
5. Select the `extension/` folder

You should see the WatchParty icon in your toolbar.

### Step 4 — Open the web app

Open `webapp/index.html` directly in a browser, or serve it:

```bash
# Simple static server (Python)
cd webapp
python3 -m http.server 5173

# Or with Node
npx serve . -p 5173
```

---

## 🎮 How to Use

### Hosting a party

1. Navigate to any streaming site (Netflix, Hulu, Disney+, HBO Max, etc.)
2. Click the WatchParty extension icon
3. Enter your name → click **Create a Party**
4. A room code appears — share it (or the link) with friends
5. The chat overlay appears on your streaming tab
6. Press play — your guests sync automatically!

### Joining a party

**Option A — Web app:**
1. Open `webapp/index.html`
2. Enter your name and the room code
3. Click Join — you'll see the chat lobby
4. Install the extension to get the in-video overlay and sync

**Option B — Extension directly:**
1. Click the extension icon on any tab
2. Enter your name and the room code
3. Open your streaming tab — the overlay and sync kick in

---

## 🏗️ Architecture

```
[Host Extension]  ─────────────────────────────────────────┐
  hooks video play/pause/seek events                        │
  emits → video-event                                       ▼
                                              [Node.js + Socket.io]
[Guest Extension] ─────────────────────────────────────────►  rooms map
  receives sync-video events                                ▼
  applies currentTime + latency correction   [Web App Lobby]
                                              guests join via room code
```

### Sync Logic

- Host's video events (play, pause, seek) are broadcast to all guests
- Each sync event includes a `timestamp` for latency compensation
- Guests auto-correct: `targetTime = currentTime + (Date.now() - timestamp) / 1000`
- If drift > 0.5 seconds, guests seek to correct position
- A re-sync poll runs every 1.5s to hook newly loaded video players (handles SPAs)

---

## 🚀 Deploying to Production

To let friends join from anywhere (not just localhost):

### Deploy the server (Railway, Render, Fly.io — all free tier)

```bash
# Example with Railway
npm install -g @railway/cli
cd server
railway login
railway init
railway up
```

Copy your deployed URL (e.g. `https://watchparty-server.railway.app`)

### Update the extension and web app

In `extension/popup/popup.js`, change:
```js
const SERVER = 'https://your-server-url.railway.app';
const WEBAPP  = 'https://your-webapp-url.com';
```

In `extension/content/content.js`, update the default serverUrl.

In `webapp/index.html`:
```js
const SERVER = 'https://your-server-url.railway.app';
```

### Host the web app

Upload `webapp/index.html` to any static host (Netlify, GitHub Pages, Vercel):
- Netlify: drag & drop the `webapp/` folder at netlify.com/drop

---

## 🛠️ Customization

| What | Where | How |
|------|-------|-----|
| Max guests | `server/server.js` | Change `>= 4` to `>= 6` for 5 guests |
| Member colors | `server/server.js` | Edit `MEMBER_COLORS` array |
| Overlay position | `content/overlay.css` | Change `top`/`right` on `#wp-overlay` |
| Server port | `server/server.js` | Change `PORT` or set `PORT` env var |
| Sync threshold | `content/content.js` | Change `0.5` in `Math.abs(v.currentTime - targetTime) > 0.5` |

---

## 📋 Supported Streaming Sites

Works on any site with an HTML5 `<video>` element, including:

- ✅ Netflix
- ✅ Hulu
- ✅ Disney+
- ✅ HBO Max / Max
- ✅ Amazon Prime Video
- ✅ Apple TV+
- ✅ Peacock
- ✅ Paramount+
- ✅ YouTube
- ✅ Twitch
- ✅ Any other HTML5 video player

> **Note:** Some streaming services use DRM-protected EME (Encrypted Media Extensions) which may prevent seeking via JavaScript in some browser configurations. Netflix and most others work fine.

---

## 🔒 Privacy

- The server only stores room state in memory — nothing is persisted to disk
- Rooms are deleted when the host disconnects
- No accounts, no tracking, no ads
