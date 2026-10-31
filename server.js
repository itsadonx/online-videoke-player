const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { Readable } = require("stream");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT) || 8080;
const app = express();
app.use(express.json({ limit: "256kb" }));
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true },
});

/** @type {Map<string, { hostId: string | null; remotes: Set<string>; leaveTimer: NodeJS.Timeout | null }>} */
const rooms = new Map();
const accountsFile = path.join(__dirname, "data", "accounts.json");

function loadAccounts() {
  try {
    const data = JSON.parse(fs.readFileSync(accountsFile, "utf8"));
    return Array.isArray(data.accounts) ? data.accounts : [];
  } catch {
    return [];
  }
}

function saveAccounts(accounts) {
  fs.mkdirSync(path.dirname(accountsFile), { recursive: true });
  const tmp = `${accountsFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ accounts }, null, 2));
  try {
    fs.renameSync(tmp, accountsFile);
  } catch {
    fs.copyFileSync(tmp, accountsFile);
    fs.unlinkSync(tmp);
  }
}

function usernameKey(name) {
  return String(name || "").trim().toLowerCase();
}

function publicName(name) {
  return String(name || "").trim().replace(/\s+/g, " ").slice(0, 32);
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString("hex");
}

function roomCodeTaken(code) {
  if (rooms.has(code)) return true;
  return loadAccounts().some((account) => account.roomId === code);
}

function savedTrack(item) {
  if (!item || typeof item !== "object") return null;
  const title = String(item.title || "").slice(0, 180);
  const videoId = String(item.videoId || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const fileId = String(item.fileId || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (item.type === "youtube" && videoId) return { type: "youtube", videoId, title: title || "YouTube video" };
  if (item.type === "gdrive" && fileId) return { type: "gdrive", fileId, title: title || "Google Drive video" };
  return null;
}

function savedState(input) {
  const queue = (Array.isArray(input?.queue) ? input.queue : []).map(savedTrack).filter(Boolean).slice(0, 100);
  return { current: savedTrack(input?.current), queue };
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function normalizeRoomId(id) {
  return String(id || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function getRoom(roomId) {
  return rooms.get(normalizeRoomId(roomId));
}

app.get("/ovp-drive/:fileId", async (req, res) => {
  const fileId = String(req.params.fileId || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const key = String(req.query.key || "").trim();
  if (!fileId || !key) {
    res.status(400).send("Missing Drive file or API key");
    return;
  }

  const params = new URLSearchParams({
    alt: "media",
    key,
    supportsAllDrives: "true",
  });
  const headers = {};
  if (req.headers.range) headers.Range = req.headers.range;

  const ac = new AbortController();
  let clientGone = false;
  const onClientClosed = () => {
    if (res.writableEnded) return;
    clientGone = true;
    // Abort outside the close stack. Doing it immediately emits an unhandled
    // AbortError on Node 24 and stops the server.
    setImmediate(() => {
      if (!ac.signal.aborted) ac.abort();
    });
  };
  res.on("close", onClientClosed);
  req.on("error", () => {});
  res.on("error", () => {});

  try {
    const upstream = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params}`,
      { headers, redirect: "follow", signal: ac.signal }
    );

    if (clientGone || res.writableEnded) {
      upstream.body?.cancel().catch(() => {});
      return;
    }

    res.status(upstream.status);
    ["content-type", "content-length", "content-range", "accept-ranges"].forEach((name) => {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    });
    if (!res.getHeader("Accept-Ranges")) res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "no-store");

    if (!upstream.body) {
      res.end();
      return;
    }
    const stream = Readable.fromWeb(upstream.body);
    stream.on("error", () => {
      if (!res.writableEnded) res.destroy();
    });
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  } catch (err) {
    if (clientGone || err?.name === "AbortError" || ac.signal.aborted) return;
    if (!res.headersSent && !res.writableEnded) {
      res.status(502).send("Could not stream Google Drive video");
    }
  }
});

app.get("/api/accounts", (_req, res) => {
  const accounts = loadAccounts()
    .map((account) => account.username)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  res.json({ accounts });
});

app.post("/api/accounts", (req, res) => {
  const username = publicName(req.body?.username);
  const password = String(req.body?.password || "");
  const key = usernameKey(username);
  if (!key || !password) {
    res.status(400).json({ ok: false, error: "Enter a username and password." });
    return;
  }
  const accounts = loadAccounts();
  if (accounts.some((account) => account.usernameKey === key)) {
    res.status(409).json({ ok: false, error: "That username is already saved." });
    return;
  }
  let roomId = generateRoomCode();
  while (roomCodeTaken(roomId)) roomId = generateRoomCode();
  const salt = crypto.randomBytes(16).toString("hex");
  const token = crypto.randomBytes(24).toString("hex");
  const account = {
    username,
    usernameKey: key,
    salt,
    passwordHash: hashPassword(password, salt),
    roomId,
    token,
    state: { current: null, queue: [] },
  };
  accounts.push(account);
  saveAccounts(accounts);
  res.json({ ok: true, username, roomId, token, state: account.state });
});

app.post("/api/accounts/enter", (req, res) => {
  const key = usernameKey(req.body?.username);
  const password = String(req.body?.password || "");
  const accounts = loadAccounts();
  const account = accounts.find((item) => item.usernameKey === key);
  const hash = account ? hashPassword(password, account.salt) : "";
  if (!account || hash !== account.passwordHash) {
    res.status(401).json({ ok: false, error: "Cannot enter the room. Password is incorrect." });
    return;
  }
  account.token = crypto.randomBytes(24).toString("hex");
  saveAccounts(accounts);
  res.json({
    ok: true,
    username: account.username,
    roomId: account.roomId,
    token: account.token,
    state: account.state || { current: null, queue: [] },
  });
});

app.post("/api/accounts/state", (req, res) => {
  const token = String(req.body?.token || "");
  if (!token) {
    res.status(401).json({ ok: false });
    return;
  }
  const accounts = loadAccounts();
  const account = accounts.find((item) => item.token === token);
  if (!account) {
    res.status(401).json({ ok: false });
    return;
  }
  account.state = savedState(req.body);
  saveAccounts(accounts);
  res.json({ ok: true });
});

app.get("/api/bgv", (_req, res) => {
  const dir = path.join(__dirname, "BGV");
  const videoExt = new Set([".mp4", ".webm", ".mkv", ".mov", ".m4v"]);
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((name) => videoExt.has(path.extname(name).toLowerCase()));
  } catch {
    names = [];
  }
  res.json({
    videos: names.map((name) => `/BGV/${encodeURIComponent(name)}`),
  });
});

app.use(express.static(path.join(__dirname)));

app.get("/remote", (_req, res) => {
  res.sendFile(path.join(__dirname, "remote.html"));
});

io.on("connection", (socket) => {
  socket.on("host:register", (payload, ack) => {
    if (typeof payload === "function") {
      ack = payload;
      payload = {};
    }
    let roomId = normalizeRoomId(payload?.roomId);
    if (!roomId) {
      roomId = generateRoomCode();
      while (roomCodeTaken(roomId)) roomId = generateRoomCode();
    }

    let room = rooms.get(roomId);
    if (room?.leaveTimer) {
      clearTimeout(room.leaveTimer);
      room.leaveTimer = null;
    }
    if (room?.hostId && room.hostId !== socket.id) {
      const previous = io.sockets.sockets.get(room.hostId);
      if (previous) {
        previous.data.role = null;
        previous.data.roomId = null;
        previous.leave(roomId);
      }
    }
    if (!room) {
      room = { hostId: null, remotes: new Set(), leaveTimer: null };
      rooms.set(roomId, room);
    }
    room.hostId = socket.id;
    socket.data.role = "host";
    socket.data.roomId = roomId;
    socket.join(roomId);

    if (typeof ack === "function") {
      ack({ ok: true, roomId });
    }
  });

  socket.on("remote:join", ({ roomId }, ack) => {
    const id = normalizeRoomId(roomId);
    const room = rooms.get(id);
    if (!room || !room.hostId) {
      if (typeof ack === "function") ack({ ok: false, error: "Room not found. Check the code on the TV/player." });
      return;
    }

    socket.data.role = "remote";
    socket.data.roomId = id;
    socket.join(id);
    room.remotes.add(socket.id);

    io.to(room.hostId).emit("host:remote-count", { count: room.remotes.size });
    io.to(room.hostId).emit("host:state-request");

    if (typeof ack === "function") {
      ack({ ok: true, roomId: id });
    }
  });

  socket.on("remote:command", ({ command, payload }) => {
    if (socket.data.role !== "remote" || !socket.data.roomId) return;
    const room = getRoom(socket.data.roomId);
    if (!room?.hostId) return;
    io.to(room.hostId).emit("host:command", {
      command,
      payload: payload || {},
      remoteId: socket.id,
    });
  });

  socket.on("host:state", (state) => {
    if (socket.data.role !== "host" || !socket.data.roomId) return;
    io.to(socket.data.roomId).emit("player:state", state);
  });

  socket.on("host:search-results", (payload) => {
    if (socket.data.role !== "host" || !socket.data.roomId) return;
    io.to(socket.data.roomId).emit("player:search-results", payload || { items: [] });
  });

  socket.on("disconnect", () => {
    const { role, roomId } = socket.data;
    if (!roomId) return;

    if (role === "host") {
      const room = rooms.get(roomId);
      if (!room || room.hostId !== socket.id) return;
      room.hostId = null;
      room.leaveTimer = setTimeout(() => {
        room.leaveTimer = null;
        if (room.hostId) return;
        io.to(roomId).emit("player:host-gone");
      }, 60000);
      return;
    }

    if (role === "remote") {
      const room = getRoom(roomId);
      if (!room) return;
      room.remotes.delete(socket.id);
      if (room.hostId) {
        io.to(room.hostId).emit("host:remote-count", { count: room.remotes.size });
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`OVP running at http://localhost:${PORT}`);
  console.log(`Phone remote:  http://localhost:${PORT}/remote`);
});
