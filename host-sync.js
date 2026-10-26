(function () {
  if (location.protocol !== "http:" && location.protocol !== "https:") return;

  const roomCodeEl = document.getElementById("remote-room-code");
  const remoteCountEl = document.getElementById("remote-count");
  const remoteLinkEl = document.getElementById("remote-link");
  const remoteQrWrap = document.getElementById("remote-qr-wrap");
  const remoteQrEl = document.getElementById("remote-qr");
  const remoteStatusEl = document.getElementById("remote-server-status");

  let socket = null;
  let remoteCount = 0;
  let roomId = null;

  function setRemoteUiStatus(text, ok) {
    if (!remoteStatusEl) return;
    remoteStatusEl.textContent = text;
    remoteStatusEl.className = "settings-status" + (ok ? " ok" : "");
  }

  function remotePageUrl(code) {
    const base = `${location.origin}/remote`;
    return code ? `${base}?room=${encodeURIComponent(code)}` : base;
  }

  function updateRemoteLinks() {
    if (remoteLinkEl && roomId) {
      remoteLinkEl.href = remotePageUrl(roomId);
      remoteLinkEl.textContent = remotePageUrl(roomId);
    }
    if (roomCodeEl) roomCodeEl.textContent = roomId || "—";
    if (remoteCountEl) remoteCountEl.textContent = String(remoteCount);
    if (roomId && remoteQrEl && remoteQrWrap) {
      const url = remotePageUrl(roomId);
      remoteQrEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(url)}`;
      remoteQrWrap.classList.remove("hidden");
    } else if (remoteQrWrap) {
      remoteQrWrap.classList.add("hidden");
    }
  }

  function broadcastState() {
    if (!socket?.connected || !window.OVP?.getState) return;
    const state = window.OVP.getState();
    state.remoteCount = remoteCount;
    state.roomId = roomId;
    socket.emit("host:state", state);
  }

  async function handleCommand({ command, payload }) {
    const ovp = window.OVP;
    if (!ovp) return;

    try {
      switch (command) {
        case "toggle-play":
          await ovp.togglePlay();
          break;
        case "next":
          await ovp.skipToNext();
          break;
        case "set-volume":
          if (typeof payload.volume === "number") ovp.setVolumeLevel(payload.volume);
          break;
        case "play-youtube":
          if (payload.videoId) {
            await ovp.playOrQueueYoutube(payload.videoId, payload.title || "YouTube video");
          }
          break;
        case "search":
          if (payload.query && ovp.searchYoutube) {
            try {
              const items = await ovp.searchYoutube(payload.query);
              socket.emit("host:search-results", { items, query: payload.query });
            } catch (err) {
              socket.emit("host:search-results", {
                items: [],
                error: err.message || "Search failed on player.",
              });
            }
          }
          break;
        case "clear-queue":
          ovp.clearQueue();
          break;
        case "remove-queue":
          if (typeof payload.index === "number") ovp.removeQueueAt(payload.index);
          break;
        case "catalog-request":
          if (ovp.getCatalogBrowse) {
            try {
              const items = await ovp.getCatalogBrowse(!!payload.forceRefresh);
              socket.emit("host:catalog", { items });
            } catch (err) {
              socket.emit("host:catalog", { items: [], error: err.message || "Catalog load failed." });
            }
          }
          break;
        default:
          break;
      }
    } catch (err) {
      console.warn("Remote command failed:", command, err);
    }
    broadcastState();
  }

  function connectHost() {
    if (typeof io === "undefined") {
      setRemoteUiStatus("Remote server unavailable. Run: npm start", false);
      return;
    }

    socket = io({ transports: ["websocket", "polling"] });

    socket.on("connect", () => {
      setRemoteUiStatus("Remote server connected.", true);
      socket.emit("host:register", (res) => {
        if (!res?.ok) {
          setRemoteUiStatus("Could not create a room.", false);
          return;
        }
        roomId = res.roomId;
        updateRemoteLinks();
        setRemoteUiStatus("Share the room code or link with phones on the same site.", true);
        broadcastState();
      });
    });

    socket.on("disconnect", () => {
      setRemoteUiStatus("Remote server disconnected.", false);
    });

    socket.on("connect_error", () => {
      setRemoteUiStatus("Remote server unavailable. Run: npm start", false);
    });

    socket.on("host:command", handleCommand);
    socket.on("host:state-request", broadcastState);
    socket.on("host:remote-count", ({ count }) => {
      remoteCount = count || 0;
      updateRemoteLinks();
      broadcastState();
    });
  }

  function loadSocketClient() {
    const script = document.createElement("script");
    script.src = "/socket.io/socket.io.js";
    script.async = true;
    script.onload = () => {
      window.addEventListener("ovp:state", broadcastState);
      setInterval(broadcastState, 4000);
      connectHost();
    };
    script.onerror = () => {
      setRemoteUiStatus("Remote server unavailable. Run: npm start", false);
    };
    document.head.appendChild(script);
  }

  loadSocketClient();
})();
