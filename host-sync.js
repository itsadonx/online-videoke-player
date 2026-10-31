(function () {
  const welcomeEl = document.getElementById("remote-welcome");
  const btnContinue = document.getElementById("btn-continue-without-remote");
  const welcomeRoomEl = document.getElementById("welcome-room-code");
  const welcomeLinkEl = document.getElementById("welcome-remote-link");
  const welcomeQrWrap = document.getElementById("welcome-qr-wrap");
  const welcomeQrEl = document.getElementById("welcome-qr");
  const welcomeStatusEl = document.getElementById("welcome-remote-status");

  function closeWelcome() {
    if (!welcomeEl) return;
    welcomeEl.hidden = true;
    welcomeEl.classList.add("hidden");
  }

  function openWelcome() {
    if (!welcomeEl) return;
    welcomeEl.hidden = false;
    welcomeEl.classList.remove("hidden");
  }

  btnContinue?.addEventListener("click", closeWelcome);

  if (location.protocol !== "http:" && location.protocol !== "https:") {
    if (welcomeStatusEl) {
      welcomeStatusEl.textContent = "Open this player from the server address to use a phone remote.";
    }
    return;
  }

  const roomCodeEl = document.getElementById("remote-room-code");
  const remoteCountEl = document.getElementById("remote-count");
  const remoteLinkEl = document.getElementById("remote-link");
  const remoteQrWrap = document.getElementById("remote-qr-wrap");
  const remoteQrEl = document.getElementById("remote-qr");
  const remoteStatusEl = document.getElementById("remote-server-status");

  let socket = null;
  let remoteCount = 0;
  let roomId = null;
  let sessionToken = "";
  let saveTimer = null;

  function setRemoteUiStatus(text, ok) {
    const className = "settings-status" + (ok ? " ok" : "");
    if (remoteStatusEl) {
      remoteStatusEl.textContent = text;
      remoteStatusEl.className = className;
    }
    if (welcomeStatusEl && !welcomeEl?.hidden) {
      welcomeStatusEl.textContent = text;
      welcomeStatusEl.className = className;
    }
  }

  function remotePageUrl(code) {
    const base = `${location.origin}/remote`;
    return code ? `${base}?room=${encodeURIComponent(code)}` : base;
  }

  function updateRemoteLinks() {
    const url = roomId ? remotePageUrl(roomId) : remotePageUrl("");
    if (remoteLinkEl && roomId) {
      remoteLinkEl.href = url;
      remoteLinkEl.textContent = url;
    }
    if (welcomeLinkEl && roomId) {
      welcomeLinkEl.href = url;
      welcomeLinkEl.textContent = url;
    }
    if (roomCodeEl) roomCodeEl.textContent = roomId || "—";
    if (welcomeRoomEl) welcomeRoomEl.textContent = roomId || "…";
    if (remoteCountEl) remoteCountEl.textContent = String(remoteCount);
    const qrSrc = roomId
      ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(url)}`
      : "";
    if (roomId && remoteQrEl && remoteQrWrap) {
      remoteQrEl.src = qrSrc;
      remoteQrWrap.classList.remove("hidden");
    } else if (remoteQrWrap) {
      remoteQrWrap.classList.add("hidden");
    }
    if (roomId && welcomeQrEl && welcomeQrWrap) {
      welcomeQrEl.src = qrSrc;
      welcomeQrWrap.classList.remove("hidden");
    } else if (welcomeQrWrap) {
      welcomeQrWrap.classList.add("hidden");
    }
  }

  function saveAccountState(state) {
    if (!sessionToken || window.OVP?.isRestoring?.()) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      fetch("/api/accounts/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: sessionToken,
          current: state.current || null,
          queue: state.queue || [],
        }),
      }).catch(() => {});
    }, 400);
  }

  function broadcastState() {
    if (!socket?.connected || !window.OVP?.getState) return;
    const state = window.OVP.getState();
    state.remoteCount = remoteCount;
    state.roomId = roomId;
    socket.emit("host:state", state);
    saveAccountState(state);
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
        case "toggle-fullscreen":
          if (ovp.toggleFullscreen) ovp.toggleFullscreen();
          break;
        case "set-volume":
          if (typeof payload.volume === "number") ovp.setVolumeLevel(payload.volume);
          break;
        case "play-youtube":
          if (payload.videoId) {
            await ovp.playOrQueueYoutube(payload.videoId, payload.title || "YouTube video");
          }
          break;
        case "play-gdrive":
          if (payload.fileId && ovp.playOrQueueGdrive) {
            await ovp.playOrQueueGdrive(payload.fileId, payload.title || "Google Drive video");
          }
          break;
        case "search": {
          const query = String(payload?.query || "").trim();
          if (!query) {
            socket.emit("host:search-results", {
              items: [],
              error: "Enter a search term or YouTube link.",
            });
            break;
          }
          if (!ovp.searchYoutube) {
            socket.emit("host:search-results", {
              items: [],
              error: "Player not ready. Refresh the OVP page on the TV or PC.",
            });
            break;
          }
          const keyInfo = ovp.getState?.()?.apiKeys;
          const isDirectLink = !!(
            window.OVPYouTube?.parseVideoId?.(query) || window.OVPDrive?.parseFileId?.(query)
          );
          const hasDriveLibrary = (ovp.getState?.()?.driveLibrary || []).length > 0;
          if (!isDirectLink && !hasDriveLibrary && keyInfo && !keyInfo.canSearch) {
            const msg =
              keyInfo.total === 0
                ? "No API keys on the player. Open Settings → Config on the TV/PC (not on the phone) and add keys."
                : "All player API keys hit quota today. Add another key on the player or try tomorrow.";
            socket.emit("host:search-results", { items: [], error: msg, query });
            break;
          }
          try {
            const items = await ovp.searchYoutube(query);
            socket.emit("host:search-results", { items, query });
          } catch (err) {
            socket.emit("host:search-results", {
              items: [],
              error: err.message || "Search failed on player.",
              query,
            });
          }
          break;
        }
        case "clear-queue":
          ovp.clearQueue();
          break;
        case "remove-queue":
          if (typeof payload.index === "number") ovp.removeQueueAt(payload.index);
          break;
        default:
          break;
      }
    } catch (err) {
      console.warn("Remote command failed:", command, err);
    }
    broadcastState();
  }

  function registerHost() {
    socket.emit("host:register", { roomId }, (res) => {
      if (!res?.ok) {
        setRemoteUiStatus("Could not open the room.", false);
        return;
      }
      roomId = res.roomId;
      updateRemoteLinks();
      setRemoteUiStatus("Share the room code or link with phones on the same site.", true);
      openWelcome();
      broadcastState();
    });
  }

  function connectHost(savedRoomId) {
    if (typeof io === "undefined") {
      setRemoteUiStatus("Remote server unavailable. Run: npm start", false);
      return;
    }
    roomId = savedRoomId || roomId;

    if (socket) {
      if (socket.connected) registerHost();
      return;
    }

    socket = io({ transports: ["websocket", "polling"] });

    socket.on("connect", () => {
      setRemoteUiStatus("Remote server connected.", true);
      registerHost();
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
      if (remoteCount > 0) closeWelcome();
    });
  }

  function loadSocketClient() {
    const script = document.createElement("script");
    script.src = "/socket.io/socket.io.js";
    script.async = true;
    script.onload = () => {
      window.addEventListener("ovp:state", broadcastState);
      setInterval(broadcastState, 4000);
      if (window.OVPSession?.roomId) connectHost(window.OVPSession.roomId);
    };
    script.onerror = () => {
      setRemoteUiStatus("Remote server unavailable. Run: npm start", false);
    };
    document.head.appendChild(script);
  }

  window.addEventListener("ovp:session", (event) => {
    sessionToken = event.detail?.token || "";
    const savedRoomId = event.detail?.roomId || "";
    if (typeof io === "undefined") return;
    connectHost(savedRoomId);
  });

  loadSocketClient();
})();
