# OVP — Online Videoke Player

Karaoke player with YouTube search, queue, and multi-user **phone remote** (Socket.io).

**Created by: Adonnis Pama**

## Run locally

```bash
npm install
npm start
```

- Player: http://localhost:8080  
- Remote: http://localhost:8080/remote  

Or double-click `start-server.bat` on Windows.

## YouTube API key

1. Enable **YouTube Data API v3** in [Google Cloud Console](https://console.cloud.google.com/).
2. Create an API key restricted by **HTTP referrer** (e.g. `http://localhost:8080/*` and your live site URL).
3. In OVP: **Settings → Config** → paste key → **Save key**.

Copy `config.example.js` to `config.js` only if you want a default key in the file (optional; not recommended for public repos).

## Deploy online (full features including remote)

InfinityFree **cannot** run Node.js. Use a Node host, for example **Render**:

1. Push this repo to GitHub.
2. [Render](https://render.com) → **New Web Service** → connect repo.
3. **Build:** `npm install` · **Start:** `npm start`
4. Add your Render URL to the YouTube API key referrers: `https://your-app.onrender.com/*`

## License

Personal / project use.
