(function () {
  const STORAGE_ROOM = "ovp_remote_room";

  const screenJoin = document.getElementById("screen-join");
  const screenMain = document.getElementById("screen-main");
  const roomInput = document.getElementById("room-input");
  const btnJoin = document.getElementById("btn-join");
  const joinError = document.getElementById("join-error");
  const connStatus = document.getElementById("conn-status");

  const nowTitle = document.getElementById("now-title");
  const nowMeta = document.getElementById("now-meta");
  const btnPlay = document.getElementById("btn-play");
  const btnNext = document.getElementById("btn-next");
  const btnLeave = document.getElementById("btn-leave");
  const btnFullscreen = document.getElementById("btn-fullscreen");
  const fullscreenLabel = document.getElementById("fullscreen-label");
  const iconFsEnter = btnFullscreen?.querySelector(".icon-fs-enter");
  const iconFsExit = btnFullscreen?.querySelector(".icon-fs-exit");
  const volume = document.getElementById("volume");
  const searchForm = document.getElementById("search-form");
  const searchQuery = document.getElementById("search-query");
  const searchHint = document.getElementById("search-hint");
  const searchMessage = document.getElementById("search-message");
  const searchResults = document.getElementById("search-results");
  const remoteCatalog = document.getElementById("remote-catalog");
  const catalogStatus = document.getElementById("catalog-status");
  const queueList = document.getElementById("queue-list");
  const queueEmpty = document.getElementById("queue-empty");
  const btnClearQueue = document.getElementById("btn-clear-queue");

  const iconPlay = btnPlay.querySelector(".icon-play");
  const iconPause = btnPlay.querySelector(".icon-pause");

  let socket = null;
  let roomId = null;
  let volumeFromServer = false;
  let lastPlayerState = null;
  let searchWaitTimer = null;

  function setConnStatus(text, kind) {
    connStatus.textContent = text;
    connStatus.className = "remote-status" + (kind ? ` ${kind}` : "");
  }

  function showJoinError(text) {
    if (!text) {
      joinError.classList.add("hidden");
      joinError.textContent = "";
      return;
    }
    joinError.textContent = text;
    joinError.classList.remove("hidden");
  }

  function send(command, payload) {
    if (!socket?.connected || !roomId) return;
    socket.emit("remote:command", { command, payload });
  }

  function updateSearchHint(state) {
    if (!searchHint) return;
    const keys = state?.apiKeys;
    if (!keys || keys.canSearch) {
      searchHint.textContent = "";
      searchHint.classList.remove("warn");
      return;
    }
    if (keys.total === 0) {
      searchHint.textContent =
        "Text search needs API keys on the player (Settings → Config on the TV/PC). You can still paste a YouTube link here.";
    } else {
      searchHint.textContent = "All player API keys hit quota today. Add another key on the player or try tomorrow.";
    }
    searchHint.classList.add("warn");
  }

  function applyState(state) {
    if (!state) return;
    lastPlayerState = state;
    updateSearchHint(state);
    nowTitle.textContent = state.nowPlaying || "—";
    const playing = state.isPlaying ? "Playing" : "Paused";
    const mode = state.playbackMode === "youtube" ? "YouTube" : state.playbackMode === "file" ? "Local file" : "Idle";
    const remotes = typeof state.remoteCount === "number" ? state.remoteCount : "?";
    nowMeta.textContent = `${playing} · ${mode} · ${remotes} remote(s)`;

    iconPlay.classList.toggle("hidden", state.isPlaying);
    iconPause.classList.toggle("hidden", !state.isPlaying);

    if (btnFullscreen) {
      const fs = !!state.isFullscreen;
      btnFullscreen.setAttribute("aria-pressed", fs ? "true" : "false");
      btnFullscreen.setAttribute("aria-label", fs ? "Exit fullscreen on player" : "Enter fullscreen on player");
      iconFsEnter?.classList.toggle("hidden", fs);
      iconFsExit?.classList.toggle("hidden", !fs);
      if (fullscreenLabel) fullscreenLabel.textContent = fs ? "Exit fullscreen" : "Fullscreen";
    }

    if (typeof state.volume === "number") {
      volumeFromServer = true;
      volume.value = String(state.volume);
      volumeFromServer = false;
    }

    const queue = state.queue || [];
    queueEmpty.classList.toggle("hidden", queue.length > 0);
    queueList.innerHTML = "";
    queue.forEach((item, index) => {
      const li = document.createElement("li");
      li.className = "remote-queue-item";
      const title = document.createElement("span");
      title.textContent = item.title || "Untitled";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remote-queue-remove";
      remove.textContent = "×";
      remove.setAttribute("aria-label", "Remove from queue");
      remove.addEventListener("click", () => send("remove-queue", { index }));
      li.append(title, remove);
      queueList.appendChild(li);
    });
  }

  function renderResultList(container, items, onPick) {
    if (!container) return;
    container.innerHTML = "";
    (items || []).forEach((item) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "remote-result-btn";
      const thumb = item.thumbnail || (item.id ? `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg` : "");
      if (thumb) {
        const img = document.createElement("img");
        img.src = thumb;
        img.alt = "";
        btn.appendChild(img);
      }
      const meta = document.createElement("div");
      meta.className = "remote-result-meta";
      const title = document.createElement("p");
      title.className = "remote-result-title";
      title.textContent = item.title;
      const channel = document.createElement("p");
      channel.className = "remote-result-channel";
      channel.textContent = item.channel || "YouTube";
      meta.append(title, channel);
      btn.appendChild(meta);
      btn.addEventListener("click", () => onPick(item));
      li.appendChild(btn);
      container.appendChild(li);
    });
  }

  function renderSearchResults(items) {
    if (!items?.length) {
      searchMessage.textContent = "No results.";
      searchMessage.classList.remove("hidden");
      searchResults.innerHTML = "";
      return;
    }
    searchMessage.classList.add("hidden");
    renderResultList(searchResults, items, (item) => {
      send("play-youtube", { videoId: item.id, title: item.title });
      searchResults.innerHTML = "";
    });
  }

  function requestCatalog() {
    if (!socket?.connected || !roomId) return;
    if (catalogStatus) catalogStatus.textContent = "Loading karaoke library from player…";
    send("catalog-request", {});
  }

  function renderCatalog(items, error) {
    if (error) {
      if (catalogStatus) catalogStatus.textContent = error;
      remoteCatalog.innerHTML = "";
      return;
    }
    if (!items?.length) {
      if (catalogStatus) {
        catalogStatus.textContent = "No library loaded. Add API key on the player (Config tab).";
      }
      return;
    }
    if (catalogStatus) {
      catalogStatus.textContent = `${items.length} karaoke songs — tap to play or queue.`;
    }
    renderResultList(remoteCatalog, items, (item) => {
      send("play-youtube", { videoId: item.id, title: item.title });
    });
  }

  function showMain() {
    screenJoin.classList.add("hidden");
    screenMain.classList.remove("hidden");
    setConnStatus(`Room ${roomId}`, "ok");
  }

  function showJoin() {
    screenMain.classList.add("hidden");
    screenJoin.classList.remove("hidden");
    roomId = null;
    sessionStorage.removeItem(STORAGE_ROOM);
    setConnStatus("Not in a room", "");
  }

  function connectSocket() {
    socket = io({ transports: ["websocket", "polling"] });

    socket.on("connect", () => {
      const params = new URLSearchParams(location.search);
      const saved = sessionStorage.getItem(STORAGE_ROOM) || params.get("room") || "";
      if (saved) {
        roomInput.value = saved.replace(/[^a-z0-9]/gi, "").slice(0, 6);
        joinRoom(roomInput.value);
      } else {
        setConnStatus("Enter room code", "");
      }
    });

    socket.on("disconnect", () => {
      setConnStatus("Disconnected", "err");
    });

    socket.on("player:state", applyState);
    socket.on("player:catalog", ({ items, error }) => {
      renderCatalog(items, error);
    });
    socket.on("player:search-results", ({ items, error }) => {
      clearTimeout(searchWaitTimer);
      searchWaitTimer = null;
      if (error) {
        searchMessage.textContent = error;
        searchMessage.classList.remove("hidden");
        searchMessage.classList.add("err");
        searchResults.innerHTML = "";
        return;
      }
      searchMessage.classList.remove("err");
      renderSearchResults(items);
    });
    socket.on("player:host-gone", () => {
      showJoin();
      showJoinError("The player went offline. Ask the host to reopen OVP.");
    });
  }

  function joinRoom(code) {
    const id = String(code || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (id.length < 4) {
      showJoinError("Enter the full room code from the player.");
      return;
    }
    showJoinError("");
    socket.emit("remote:join", { roomId: id }, (res) => {
      if (!res?.ok) {
        showJoinError(res?.error || "Could not join room.");
        return;
      }
      roomId = res.roomId;
      sessionStorage.setItem(STORAGE_ROOM, roomId);
      history.replaceState(null, "", `${location.pathname}?room=${roomId}`);
      showMain();
      requestCatalog();
    });
  }

  btnJoin.addEventListener("click", () => joinRoom(roomInput.value));
  roomInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") joinRoom(roomInput.value);
  });

  btnPlay.addEventListener("click", () => send("toggle-play"));
  btnNext.addEventListener("click", () => send("next"));
  btnFullscreen?.addEventListener("click", () => send("toggle-fullscreen"));
  btnLeave.addEventListener("click", () => {
    socket?.disconnect();
    connectSocket();
    showJoin();
  });

  volume.addEventListener("input", () => {
    if (volumeFromServer) return;
    send("set-volume", { volume: parseFloat(volume.value) });
  });

  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const query = searchQuery.value.trim();
    if (!query) return;
    clearTimeout(searchWaitTimer);
    searchMessage.textContent = "Searching on player…";
    searchMessage.classList.remove("hidden", "err");
    send("search", { query });
    searchWaitTimer = setTimeout(() => {
      searchWaitTimer = null;
      if (searchMessage.textContent.startsWith("Searching")) {
        searchMessage.textContent =
          "No response from the player. Keep the OVP page open on the TV/PC, confirm the room code, and run npm start / use your Render URL.";
        searchMessage.classList.add("err");
      }
    }, 25000);
  });

  btnClearQueue.addEventListener("click", () => send("clear-queue"));

  connectSocket();
})();
