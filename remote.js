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
  const reservedCount = document.getElementById("reserved-count");
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
  const songList = document.getElementById("song-list");
  const songAlpha = document.getElementById("song-alpha");
  const SONG_LETTERS = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];
  const songEmpty = document.getElementById("song-empty");
  const queueList = document.getElementById("queue-list");
  const queueEmpty = document.getElementById("queue-empty");
  const btnClearQueue = document.getElementById("btn-clear-queue");
  const historyList = document.getElementById("history-list");
  const historyEmpty = document.getElementById("history-empty");
  const tabButtons = document.querySelectorAll(".remote-tab");
  const tabPanels = {
    control: document.getElementById("panel-control"),
    songs: document.getElementById("panel-songs"),
    upnext: document.getElementById("panel-upnext"),
    history: document.getElementById("panel-history"),
  };

  const iconPlay = btnPlay.querySelector(".icon-play");
  const iconPause = btnPlay.querySelector(".icon-pause");

  let socket = null;
  let roomId = null;
  let volumeFromServer = false;
  let lastPlayerState = null;
  let searchWaitTimer = null;
  let songMode = "drive";
  let searchItems = null;
  let seenReserveId = null;
  let reserveToastReady = false;
  let reserveToastTimer = null;

  function showReservedToast() {
    const toast = document.getElementById("reserve-toast");
    if (!toast) return;
    toast.textContent = "Successfully Reserved";
    toast.classList.add("is-visible");
    clearTimeout(reserveToastTimer);
    reserveToastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
  }

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
    const base = "Type to filter Google Drive. Press Search or Enter to search Drive and YouTube.";
    if (!keys || keys.canSearch) {
      searchHint.textContent = base;
      searchHint.classList.remove("warn");
      return;
    }
    if (keys.total === 0) {
      searchHint.textContent =
        base + " YouTube search needs API keys on the player (Settings → Config).";
    } else {
      searchHint.textContent =
        base + " All player API keys hit quota today, so YouTube search may be unavailable.";
    }
    searchHint.classList.add("warn");
  }

  function switchTab(name) {
    tabButtons.forEach((btn) => {
      const on = btn.dataset.tab === name;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    Object.entries(tabPanels).forEach(([key, panel]) => {
      if (!panel) return;
      panel.hidden = key !== name;
    });
  }

  function toDriveRow(item) {
    return {
      id: item.id,
      title: item.title,
      source: "gdrive",
      channel: "Google Drive",
      thumbnail: item.thumbnail,
    };
  }

  function filterDriveLibrary(query) {
    const drive = lastPlayerState?.driveLibrary || [];
    const q = String(query || "").trim().toLowerCase();
    const matched = !q
      ? drive
      : drive.filter((item) => String(item.title || "").toLowerCase().includes(q));
    return matched.map(toDriveRow);
  }

  function renderSongList() {
    if (!songList) return;
    if (songMode === "search" && searchItems) {
      if (songEmpty) {
        songEmpty.textContent = searchItems.length ? "" : "No results.";
        songEmpty.classList.toggle("hidden", searchItems.length > 0);
      }
      renderGroupedSongs(songList, searchItems, playRemoteItem);
      return;
    }
    const drive = lastPlayerState?.driveLibrary || [];
    const query = searchQuery?.value || "";
    const items = filterDriveLibrary(query);
    if (songEmpty) {
      if (!drive.length) {
        songEmpty.textContent = "No Google Drive folder on the player yet.";
        songEmpty.classList.remove("hidden");
      } else if (!items.length) {
        songEmpty.textContent = "No Drive songs match.";
        songEmpty.classList.remove("hidden");
      } else {
        songEmpty.classList.add("hidden");
      }
    }
    renderGroupedSongs(songList, items, playRemoteItem);
  }

  function songIndexLetter(title) {
    const match = String(title || "").trim().match(/[A-Za-z0-9]/);
    if (!match) return "#";
    const ch = match[0].toUpperCase();
    return ch >= "A" && ch <= "Z" ? ch : "#";
  }

  function renderSongAlpha(present) {
    if (!songAlpha) return;
    songAlpha.innerHTML = "";
    songAlpha.hidden = present.size === 0;
    SONG_LETTERS.forEach((letter) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "song-alpha-btn";
      btn.textContent = letter;
      btn.disabled = !present.has(letter);
      btn.addEventListener("click", () => {
        songAlpha.querySelectorAll(".song-alpha-btn").forEach((el) => el.classList.remove("is-active"));
        btn.classList.add("is-active");
        const heading = [...songList.querySelectorAll("[data-letter]")].find((el) => el.dataset.letter === letter);
        if (!heading) return;
        const headings = [...songList.querySelectorAll(".song-letter-heading")];
        headings.forEach((el) => el.classList.add("song-letter-measuring"));
        let top = 0;
        let node = heading;
        while (node && node !== songList) {
          top += node.offsetTop;
          node = node.offsetParent;
        }
        headings.forEach((el) => el.classList.remove("song-letter-measuring"));
        songList.scrollTop = top;
      });
      songAlpha.appendChild(btn);
    });
  }

  function renderGroupedSongs(container, items, onPick) {
    if (!container) return;
    container.innerHTML = "";
    const groups = new Map();
    (items || []).forEach((item) => {
      const letter = songIndexLetter(item.title);
      if (!groups.has(letter)) groups.set(letter, []);
      groups.get(letter).push(item);
    });
    SONG_LETTERS.forEach((letter) => {
      const songs = groups.get(letter);
      if (!songs?.length) return;
      const heading = document.createElement("li");
      heading.className = "song-letter-heading";
      heading.dataset.letter = letter;
      heading.textContent = letter;
      container.appendChild(heading);
      songs.forEach((item) => {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "song-name-btn";
        btn.textContent = item.title || "Untitled";
        btn.addEventListener("click", () => onPick(item));
        li.appendChild(btn);
        container.appendChild(li);
      });
    });
    const spacer = document.createElement("li");
    spacer.className = "song-list-spacer";
    spacer.setAttribute("aria-hidden", "true");
    container.appendChild(spacer);
    renderSongAlpha(groups);
  }

  function applyState(state) {
    if (!state) return;
    lastPlayerState = state;
    updateSearchHint(state);
    nowTitle.textContent = state.nowPlaying || "—";
    const playing = state.isPlaying ? "Playing" : "Paused";
    const mode =
      state.playbackMode === "youtube"
        ? "YouTube"
        : state.playbackMode === "gdrive" || state.playbackMode === "gdrive-embed"
          ? "Google Drive"
          : state.playbackMode === "file"
            ? "Local file"
            : "Idle";
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
    if (reservedCount) {
      reservedCount.textContent = `R: ${queue.length}`;
      reservedCount.setAttribute(
        "aria-label",
        `${queue.length} reserved song${queue.length === 1 ? "" : "s"}`
      );
    }
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

    const history = (state.history || []).filter((item) => item.videoId || item.fileId);
    if (historyEmpty) historyEmpty.classList.toggle("hidden", history.length > 0);
    if (historyList) {
      renderResultList(
        historyList,
        history.map((item) => ({
          id: item.fileId || item.videoId,
          title: item.title,
          type: item.type,
          source: item.type === "gdrive" ? "gdrive" : "youtube",
          channel: item.type === "gdrive" ? "Google Drive · tap to play" : "Tap to play or queue",
          thumbnail:
            item.type === "gdrive"
              ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(item.fileId || item.videoId)}&sz=w320`
              : `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`,
        })),
        playRemoteItem
      );
    }

    renderSongList();

    const notice = state.reserveNotice;
    if (!reserveToastReady) {
      reserveToastReady = true;
      seenReserveId = notice?.id || null;
    } else if (notice?.id && notice.id !== seenReserveId) {
      seenReserveId = notice.id;
      showReservedToast();
    }
  }

  function playRemoteItem(item) {
    if (item.source === "gdrive" || item.type === "gdrive") {
      send("play-gdrive", { fileId: item.fileId || item.id, title: item.title });
      return;
    }
    send("play-youtube", { videoId: item.id || item.videoId, title: item.title });
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
      const source = item.source === "gdrive" || item.type === "gdrive" ? "drive" : "youtube";
      const badge = document.createElement("span");
      badge.className = `source-badge source-badge-${source}`;
      badge.textContent = source === "drive" ? "Drive" : "YouTube";
      channel.append(badge, document.createTextNode(item.channel || (source === "drive" ? "Google Drive" : "YouTube")));
      meta.append(title, channel);
      btn.appendChild(meta);
      btn.addEventListener("click", () => onPick(item));
      li.appendChild(btn);
      container.appendChild(li);
    });
  }

  function renderSearchResults(items) {
    songMode = "search";
    searchItems = items || [];
    searchMessage.classList.add("hidden");
    renderSongList();
  }

  function showMain() {
    screenJoin.classList.add("hidden");
    screenMain.classList.remove("hidden");
    btnLeave?.classList.remove("hidden");
    setConnStatus(`Room ${roomId}`, "ok");
  }

  function showJoin() {
    screenMain.classList.add("hidden");
    screenJoin.classList.remove("hidden");
    btnLeave?.classList.add("hidden");
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
    socket.on("player:search-results", ({ items, error }) => {
      clearTimeout(searchWaitTimer);
      searchWaitTimer = null;
      if (error) {
        songMode = "drive";
        searchItems = null;
        searchMessage.textContent = error;
        searchMessage.classList.remove("hidden");
        searchMessage.classList.add("err");
        renderSongList();
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

  searchQuery?.addEventListener("input", () => {
    songMode = "drive";
    searchItems = null;
    searchMessage?.classList.add("hidden");
    renderSongList();
  });

  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const query = searchQuery.value.trim();
    if (!query) {
      songMode = "drive";
      searchItems = null;
      renderSongList();
      return;
    }
    clearTimeout(searchWaitTimer);
    searchMessage.textContent = "Searching Drive and YouTube…";
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

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab || "control"));
  });

  btnClearQueue.addEventListener("click", () => send("clear-queue"));

  connectSocket();
})();
