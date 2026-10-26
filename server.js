const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT) || 8080;
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true },
});

/** @type {Map<string, { hostId: string | null; remotes: Set<string> }>} */
const rooms = new Map();

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

app.use(express.static(path.join(__dirname)));

app.get("/remote", (_req, res) => {
  res.sendFile(path.join(__dirname, "remote.html"));
});

io.on("connection", (socket) => {
  socket.on("host:register", (ack) => {
    let roomId = generateRoomCode();
    while (rooms.has(roomId)) roomId = generateRoomCode();

    rooms.set(roomId, { hostId: socket.id, remotes: new Set() });
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

  socket.on("host:catalog", (payload) => {
    if (socket.data.role !== "host" || !socket.data.roomId) return;
    io.to(socket.data.roomId).emit("player:catalog", payload || { items: [] });
  });

  socket.on("disconnect", () => {
    const { role, roomId } = socket.data;
    if (!roomId) return;

    if (role === "host") {
      io.to(roomId).emit("player:host-gone");
      rooms.delete(roomId);
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
