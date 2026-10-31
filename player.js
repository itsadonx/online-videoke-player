(function () {
  const STORAGE_KEYS = "ovp_youtube_api_keys";
  const STORAGE_KEY_LEGACY = "ovp_youtube_api_key";
  const STORAGE_QUOTA = "ovp_youtube_api_quota_until";
  const STORAGE_HISTORY = "ovp_play_history";
  const STORAGE_DRIVE_FOLDER = "ovp_gdrive_folder";
  const HISTORY_MAX = 80;

  const btnSettings = document.getElementById("btn-settings");
  const btnSettingsClose = document.getElementById("btn-settings-close");
  const settingsPanel = document.getElementById("settings-panel");
  const settingsBackdrop = document.getElementById("settings-backdrop");
  const apiKeyListEl = document.getElementById("api-key-list");
  const youtubeApiKeyNew = document.getElementById("youtube-api-key-new");
  const youtubeApiKeyLabel = document.getElementById("youtube-api-key-label");
  const btnAddApiKey = document.getElementById("btn-add-api-key");
  const btnResetQuotaFlags = document.getElementById("btn-reset-quota-flags");
  const apiKeyStatus = document.getElementById("api-key-status");

  const youtubeForm = document.getElementById("youtube-form");
  const youtubeQuery = document.getElementById("youtube-query");
  const btnYoutubeSearch = document.getElementById("btn-youtube-search");
  const youtubeMessage = document.getElementById("youtube-message");
  const youtubeResults = document.getElementById("youtube-results");
  const queueList = document.getElementById("queue-list");
  const reservedCount = document.getElementById("reserved-count");
  const queueEmpty = document.getElementById("queue-empty");
  const tabBadgeUpnext = document.getElementById("tab-badge-upnext");
  const btnClearQueue = document.getElementById("btn-clear-queue");
  const historyList = document.getElementById("history-list");
  const historyEmpty = document.getElementById("history-empty");
  const tabBadgeHistory = document.getElementById("tab-badge-history");
  const btnClearHistory = document.getElementById("btn-clear-history");
  const driveLibraryEl = document.getElementById("drive-library");
  const driveLibraryStatus = document.getElementById("drive-library-status");
  const gdriveFolderUrl = document.getElementById("gdrive-folder-url");
  const btnSaveGdriveFolder = document.getElementById("btn-save-gdrive-folder");
  const gdriveFolderStatus = document.getElementById("gdrive-folder-status");
  const gdriveHost = document.getElementById("gdrive-player");
  const settingsTabButtons = document.querySelectorAll(".settings-tab");
  const settingsTabPanels = {
    upnext: document.getElementById("panel-upnext"),
    songs: document.getElementById("panel-songs"),
    history: document.getElementById("panel-history"),
    config: document.getElementById("panel-config"),
  };

  const video = document.getElementById("karaoke-video");
  const youtubeHost = document.getElementById("youtube-player");
  const wrap = document.querySelector(".video-wrap");
  const btnPlay = document.getElementById("btn-play");
  const btnCenterPlay = document.getElementById("btn-center-play");
  const btnNext = document.getElementById("btn-next");
  const appRoot = document.querySelector(".app");
  const btnMute = document.getElementById("btn-mute");
  const btnFullscreen = document.getElementById("btn-fullscreen");
  const fileInput = document.getElementById("file-input");
  const progressInput = document.getElementById("progress-input");
  const progressFill = document.getElementById("progress-fill");
  const progressBuffer = document.getElementById("progress-buffer");
  const timeCurrent = document.getElementById("time-current");
  const timeDuration = document.getElementById("time-duration");
  const volumeInput = document.getElementById("volume-input");
  const nowPlayingTitle = document.getElementById("now-playing-title");
  const playerFrame = document.querySelector(".player-frame");
  const iconPlay = btnPlay.querySelector(".icon-play");
  const iconPause = btnPlay.querySelector(".icon-pause");

  let objectUrl = null;
  let playbackMode = "none"; // none | file | youtube | gdrive | gdrive-embed
  /** @type {{ id: string; title: string; thumbnail?: string; source?: string }[]} */
  let driveLibraryItems = [];
  let ytProgressTimer = null;
  let driveEmbedTimer = null;
  let driveEmbedFileId = null;
  let driveEmbedPaused = false;
  let youtubeWantsAutoplay = false;
  let lastVolume = 85;
  /** @type {{ type: "youtube" | "file"; title: string; videoId?: string; file?: File }[]} */
  let playQueue = [];
  let suppressEndedAdvance = false;
  let lastReserveNotice = null;
  let reserveToastTimer = null;

  function emitLocalStateChange() {
    window.dispatchEvent(new CustomEvent("ovp:state"));
  }

  function quotaMapId(key) {
    return String(key);
  }

  function keyDisplaySuffix(key) {
    const s = String(key);
    return s.length > 4 ? s.slice(-4) : s;
  }

  function loadQuotaMap() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_QUOTA) || "{}");
    } catch {
      return {};
    }
  }

  function saveQuotaMap(map) {
    localStorage.setItem(STORAGE_QUOTA, JSON.stringify(map));
  }

  function endOfUtcDayIso() {
    const d = new Date();
    d.setUTCHours(24, 0, 0, 0);
    return d.toISOString();
  }

  function isKeyExhausted(key) {
    const map = loadQuotaMap();
    const id = quotaMapId(key);
    const until = map[id];
    if (!until) return false;
    if (Date.now() >= new Date(until).getTime()) {
      delete map[id];
      saveQuotaMap(map);
      return false;
    }
    return true;
  }

  function markKeyExhausted(key) {
    const map = loadQuotaMap();
    map[quotaMapId(key)] = endOfUtcDayIso();
    saveQuotaMap(map);
    renderApiKeysList();
    updateApiKeyStatus();
  }

  function getApiKeysList() {
    let list = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed;
      }
    } catch {
      /* ignore */
    }
    if (!list.length) {
      const legacy = localStorage.getItem(STORAGE_KEY_LEGACY)?.trim();
      if (legacy) list = [{ id: "legacy", label: "Key 1", key: legacy }];
    }

    const cfgList = Array.isArray(window.OVP_CONFIG?.youtubeApiKeys) ? window.OVP_CONFIG.youtubeApiKeys : [];
    const cfgKeys = cfgList
      .map((e, i) => ({
        id: e.id || `cfg-${i}`,
        label: e.label || `Default ${i + 1}`,
        key: (e.key || e || "").toString().trim(),
      }))
      .filter((e) => e.key);
    const cfgSingle = (window.OVP_CONFIG?.driveApiKey || window.OVP_CONFIG?.youtubeApiKey || "").trim();
    if (cfgSingle) {
      cfgKeys.unshift({ id: "config-default", label: "Default", key: cfgSingle });
    }
    if (cfgKeys.length) {
      list = [...cfgKeys, ...list];
    }
    const normalized = list
      .filter((e) => e.key?.trim())
      .map((e, i) => ({
        id: e.id || `key-${i}`,
        label: e.label || `Key ${i + 1}`,
        key: e.key.trim(),
      }));
    const seen = new Set();
    return normalized.filter((e) => {
      if (seen.has(e.key)) return false;
      seen.add(e.key);
      return true;
    });
  }

  function saveApiKeysList(list) {
    localStorage.setItem(STORAGE_KEYS, JSON.stringify(list));
    localStorage.removeItem(STORAGE_KEY_LEGACY);
  }

  function getApiKey() {
    const keys = getApiKeysList();
    const available = keys.find((e) => !isKeyExhausted(e.key));
    return available?.key || keys[0]?.key || "";
  }

  function hasAnyApiKey() {
    return getApiKeysList().length > 0;
  }

  function hasActiveApiKey() {
    return getApiKeysList().some((e) => !isKeyExhausted(e.key));
  }

  function shouldTryNextApiKey(err) {
    if (err?.quota) return true;
    const status = err?.status;
    if (status === 403 || status === 401) return true;
    const msg = (err?.message || "").toLowerCase();
    return /api key|referer|referrer|forbidden|permission|quota|exceeded|suspended/.test(msg);
  }

  async function runWithApiKeys(fn) {
    const keys = getApiKeysList();
    if (!keys.length) {
      throw new Error("Add at least one YouTube API key in Config.");
    }
    let lastErr = null;
    let tried = 0;
    for (const entry of keys) {
      if (isKeyExhausted(entry.key)) continue;
      tried++;
      try {
        return await fn(entry.key);
      } catch (err) {
        lastErr = err;
        const moreKeys = keys.some(
          (other) => other.key !== entry.key && !isKeyExhausted(other.key)
        );
        if (moreKeys && shouldTryNextApiKey(err)) {
          if (err?.quota) markKeyExhausted(entry.key);
          continue;
        }
        if (err?.quota) markKeyExhausted(entry.key);
        throw err;
      }
    }
    if (!tried) {
      throw new Error("All API keys hit today's quota. Add another key or try again tomorrow.");
    }
    throw lastErr || new Error("All API keys failed.");
  }

  function clearQuotaFlags() {
    saveQuotaMap({});
    renderApiKeysList();
    updateApiKeyStatus();
    if (apiKeyStatus) {
      apiKeyStatus.textContent = "Cleared quota-used flags for today. Keys will be tried again.";
      apiKeyStatus.className = "settings-status ok";
    }
  }

  function updateApiKeyStatus() {
    if (!apiKeyStatus) return;
    const keys = getApiKeysList();
    if (!keys.length) {
      apiKeyStatus.textContent = "No API keys saved yet.";
      apiKeyStatus.className = "settings-status";
      return;
    }
    const exhausted = keys.filter((k) => isKeyExhausted(k.key)).length;
    const active = keys.length - exhausted;
    apiKeyStatus.textContent = `${keys.length} key(s): ${active} active, ${exhausted} quota-used today.`;
    apiKeyStatus.className = "settings-status" + (active > 0 ? " ok" : " err");
  }

  function renderApiKeysList() {
    if (!apiKeyListEl) return;
    const keys = getApiKeysList();
    apiKeyListEl.innerHTML = "";
    keys.forEach((entry, index) => {
      const li = document.createElement("li");
      li.className = "api-key-item" + (isKeyExhausted(entry.key) ? " exhausted" : "");
      const label = document.createElement("span");
      label.className = "api-key-item-label";
      label.textContent = entry.label;
      const meta = document.createElement("span");
      meta.className = "api-key-item-meta";
      const status = isKeyExhausted(entry.key) ? "Quota used today" : `••••${keyDisplaySuffix(entry.key)}`;
      meta.textContent = status;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "api-key-item-remove";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Remove ${entry.label}`);
      remove.addEventListener("click", () => {
        const next = getApiKeysList().filter((_, i) => i !== index);
        saveApiKeysList(next);
        renderApiKeysList();
        updateApiKeyStatus();
      });
      li.append(label, meta, remove);
      apiKeyListEl.appendChild(li);
    });
    updateApiKeyStatus();
  }

  function switchSettingsTab(tabId) {
    settingsTabButtons.forEach((tab) => {
      const active = tab.dataset.tab === tabId;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    Object.entries(settingsTabPanels).forEach(([id, panel]) => {
      if (!panel) return;
      const show = id === tabId;
      panel.hidden = !show;
      panel.classList.toggle("hidden", !show);
    });
    if (tabId === "songs") void refreshDriveLibrary();
    if (tabId === "config") fillDriveFolderInput();
  }

  settingsTabButtons.forEach((tab) => {
    tab.addEventListener("click", () => switchSettingsTab(tab.dataset.tab || "upnext"));
  });

  function fitYoutubeEmbed() {
    if (!wrap.classList.contains("mode-youtube")) return;
    const iframe = youtubeHost?.querySelector("iframe");
    if (!iframe) return;

    iframe.removeAttribute("width");
    iframe.removeAttribute("height");

    const w = Math.max(wrap.clientWidth, 1);
    const h = Math.max(wrap.clientHeight, 1);
    const yt = getYoutubePlayer();
    if (yt && typeof yt.setSize === "function") {
      yt.setSize(w, h);
    }

    iframe.style.width = "100%";
    iframe.style.height = "calc(100% + 120px)";
    iframe.style.maxWidth = "none";
    iframe.style.left = "0";
    iframe.style.top = "0";
    iframe.style.marginTop = "-48px";
  }

  function notifyPlayerLayoutChange() {
    window.dispatchEvent(new Event("resize"));
    fitYoutubeEmbed();
  }

  function scheduleLayoutRefresh() {
    notifyPlayerLayoutChange();
    requestAnimationFrame(notifyPlayerLayoutChange);
    [50, 150, 320, 500].forEach((ms) => setTimeout(notifyPlayerLayoutChange, ms));
  }

  function setSettingsOpen(open, { tab } = {}) {
    btnSettings.setAttribute("aria-expanded", open ? "true" : "false");

    if (open) {
      settingsPanel.hidden = false;
      settingsPanel.setAttribute("aria-hidden", "false");
      requestAnimationFrame(() => {
        document.body.classList.add("settings-open");
        scheduleLayoutRefresh();
      });
      switchSettingsTab(tab || "songs");
      renderApiKeysList();
      if (youtubeApiKeyNew) youtubeApiKeyNew.value = "";
      if (youtubeApiKeyLabel) youtubeApiKeyLabel.value = "";
      return;
    }

    document.body.classList.remove("settings-open");
    settingsPanel.setAttribute("aria-hidden", "true");

    let closeFinished = false;
    const finishClose = () => {
      if (closeFinished) return;
      closeFinished = true;
      settingsPanel.hidden = true;
      scheduleLayoutRefresh();
    };

    const onTransitionEnd = (e) => {
      if (e.target !== settingsPanel) return;
      if (e.propertyName !== "max-width" && e.propertyName !== "width") return;
      settingsPanel.removeEventListener("transitionend", onTransitionEnd);
      finishClose();
    };
    settingsPanel.addEventListener("transitionend", onTransitionEnd);
    setTimeout(finishClose, 450);
    scheduleLayoutRefresh();
  }

  btnSettings.addEventListener("click", () => setSettingsOpen(settingsPanel.hidden));
  btnSettingsClose.addEventListener("click", () => setSettingsOpen(false));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !settingsPanel.hidden) setSettingsOpen(false);
  });

  btnResetQuotaFlags?.addEventListener("click", () => clearQuotaFlags());

  btnAddApiKey?.addEventListener("click", () => {
    const key = youtubeApiKeyNew?.value.trim();
    if (!key) {
      updateApiKeyStatus();
      if (apiKeyStatus) {
        apiKeyStatus.textContent = "Paste an API key before adding.";
        apiKeyStatus.className = "settings-status err";
      }
      return;
    }
    const list = getApiKeysList();
    if (list.some((e) => e.key === key)) {
      if (apiKeyStatus) {
        apiKeyStatus.textContent = "That key is already in the list.";
        apiKeyStatus.className = "settings-status err";
      }
      return;
    }
    const label = youtubeApiKeyLabel?.value.trim() || `Key ${list.length + 1}`;
    list.push({ id: `key-${Date.now()}`, label, key });
    saveApiKeysList(list);
    if (youtubeApiKeyNew) youtubeApiKeyNew.value = "";
    if (youtubeApiKeyLabel) youtubeApiKeyLabel.value = "";
    renderApiKeysList();
    emitLocalStateChange();
    if (apiKeyStatus) {
      apiKeyStatus.textContent = "API key added.";
      apiKeyStatus.className = "settings-status ok";
    }
  });

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function setPlayingUI(playing) {
    wrap.classList.toggle("is-playing", playing);
    iconPlay.classList.toggle("hidden", playing);
    iconPause.classList.toggle("hidden", !playing);
  }

  function stopYtProgressTimer() {
    if (ytProgressTimer) {
      clearInterval(ytProgressTimer);
      ytProgressTimer = null;
    }
  }

  function startYtProgressTimer() {
    stopYtProgressTimer();
    ytProgressTimer = setInterval(updateProgress, 250);
  }

  function getYoutubePlayer() {
    return window.OVPYouTube?.getPlayer?.() || null;
  }

  function updateProgress() {
    if (playbackMode === "youtube") {
      const yt = getYoutubePlayer();
      if (!yt || typeof yt.getCurrentTime !== "function") return;
      const current = yt.getCurrentTime();
      const duration = yt.getDuration();
      if (!duration) {
        progressFill.style.width = "0%";
        progressInput.value = "0";
        timeCurrent.textContent = formatTime(current);
        return;
      }
      const pct = (current / duration) * 100;
      progressFill.style.width = `${pct}%`;
      progressInput.value = String(pct);
      timeCurrent.textContent = formatTime(current);
      timeDuration.textContent = formatTime(duration);
      return;
    }

    const duration = video.duration;
    const current = video.currentTime;
    if (!duration) {
      progressFill.style.width = "0%";
      progressInput.value = "0";
      timeCurrent.textContent = formatTime(current);
      return;
    }
    const pct = (current / duration) * 100;
    progressFill.style.width = `${pct}%`;
    progressInput.value = String(pct);
    timeCurrent.textContent = formatTime(current);
    timeDuration.textContent = formatTime(duration);
  }

  function updateBuffer() {
    if (!isHtml5Mode()) {
      progressBuffer.style.width = "0%";
      return;
    }
    if (!video.buffered.length || !video.duration) {
      progressBuffer.style.width = "0%";
      return;
    }
    const end = video.buffered.end(video.buffered.length - 1);
    progressBuffer.style.width = `${(end / video.duration) * 100}%`;
  }

  function youtubeIsPlaying() {
    const yt = getYoutubePlayer();
    try {
      const state = yt?.getPlayerState?.();
      return state === 1 || state === 3;
    } catch {
      return false;
    }
  }

  function commandYoutube(action) {
    const yt = getYoutubePlayer();
    if (yt && typeof yt[action] === "function") {
      yt[action]();
      return;
    }
    const iframe = youtubeHost?.querySelector("iframe");
    iframe?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func: action, args: [] }),
      "*"
    );
  }

  function toggleDriveEmbedPlayback() {
    const iframe = gdriveHost?.querySelector("iframe");
    if (!iframe || !driveEmbedFileId) return;
    if (!driveEmbedPaused) {
      clearDriveEmbedTimer();
      iframe.src = "about:blank";
      driveEmbedPaused = true;
      setPlayingUI(false);
    } else {
      iframe.src = `${window.OVPDrive.embedUrl(driveEmbedFileId)}?usp=drivesdk&autoplay=1&mute=0`;
      driveEmbedPaused = false;
      setPlayingUI(true);
      scheduleDriveEmbedAdvance(driveEmbedFileId);
    }
    emitLocalStateChange();
  }

  async function togglePlay() {
    youtubeWantsAutoplay = false;
    if (playbackMode === "gdrive-embed") {
      toggleDriveEmbedPlayback();
      return;
    }
    if (playbackMode === "youtube") {
      commandYoutube(youtubeIsPlaying() ? "pauseVideo" : "playVideo");
      emitLocalStateChange();
      return;
    }
    if (!video.src && !video.currentSrc) return;
    if (video.paused) {
      try {
        await video.play();
      } catch {
        try {
          video.muted = true;
          await video.play();
          video.muted = parseFloat(volumeInput.value) === 0;
        } catch {
          /* browser blocked playback */
        }
      }
    } else {
      video.pause();
    }
    emitLocalStateChange();
  }

  function clearFileSource() {
    video.pause();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    video.removeAttribute("src");
    video.load();
  }

  function youtubeTrack(videoId, title) {
    return { type: "youtube", videoId, title: title || "YouTube video" };
  }

  function gdriveTrack(fileId, title) {
    return { type: "gdrive", fileId, title: title || "Google Drive video" };
  }

  function isHtml5Mode() {
    return playbackMode === "file" || playbackMode === "gdrive";
  }

  function fileTrack(file) {
    return {
      type: "file",
      file,
      title: file.name.replace(/\.[^.]+$/, ""),
    };
  }

  function historyKey(entry) {
    if (entry?.type === "youtube" && entry.videoId) return `yt:${entry.videoId}`;
    if (entry?.type === "gdrive" && entry.fileId) return `gd:${entry.fileId}`;
    if (entry?.type === "file") return `file:${entry.title}`;
    return "";
  }

  function loadPlayHistory() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_HISTORY) || "[]");
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((e) => e && e.title)
        .map((e) => ({
          type: e.type === "file" ? "file" : e.type === "gdrive" ? "gdrive" : "youtube",
          title: String(e.title),
          videoId: e.videoId ? String(e.videoId) : "",
          fileId: e.fileId ? String(e.fileId) : "",
          playedAt: Number(e.playedAt) || 0,
        }))
        .filter((e) => (e.type === "youtube" ? e.videoId : e.type === "gdrive" ? e.fileId : true));
    } catch {
      return [];
    }
  }

  function savePlayHistory(list) {
    try {
      localStorage.setItem(STORAGE_HISTORY, JSON.stringify(list.slice(0, HISTORY_MAX)));
    } catch {
      /* ignore quota */
    }
  }

  function formatPlayedAt(ts) {
    const t = Number(ts) || 0;
    if (!t) return "Played";
    const diff = Date.now() - t;
    if (diff < 60_000) return "Just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
    return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function recordPlayHistory(item) {
    if (!item?.title) return;
    const entry = {
      type: item.type === "gdrive" ? "gdrive" : item.type === "file" ? "file" : "youtube",
      title: item.title,
      videoId: item.videoId || "",
      fileId: item.fileId || "",
      playedAt: Date.now(),
    };
    if (!historyKey(entry)) return;
    const next = [entry, ...loadPlayHistory().filter((e) => historyKey(e) !== historyKey(entry))].slice(
      0,
      HISTORY_MAX
    );
    savePlayHistory(next);
    renderPlayHistory();
  }

  function renderPlayHistory() {
    if (!historyList) return;
    const items = loadPlayHistory();
    if (historyEmpty) historyEmpty.classList.toggle("hidden", items.length > 0);
    if (tabBadgeHistory) {
      if (items.length > 0) {
        tabBadgeHistory.textContent = String(Math.min(items.length, 99));
        tabBadgeHistory.classList.remove("hidden");
      } else {
        tabBadgeHistory.classList.add("hidden");
      }
    }
    historyList.classList.toggle("hidden", items.length === 0);
    historyList.innerHTML = "";
    items.forEach((entry) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "youtube-result-btn";
      const thumb =
        entry.type === "youtube" && entry.videoId
          ? `https://i.ytimg.com/vi/${entry.videoId}/mqdefault.jpg`
          : entry.type === "gdrive" && entry.fileId
            ? window.OVPDrive?.thumbnailUrl?.(entry.fileId) || ""
            : "";
      btn.innerHTML = `
        ${thumb ? `<img class="youtube-result-thumb" src="${thumb}" alt="" loading="lazy" />` : `<span class="history-file-thumb" aria-hidden="true">FILE</span>`}
        <div class="youtube-result-meta">
          <p class="youtube-result-title"></p>
          <p class="youtube-result-channel"></p>
        </div>
      `;
      btn.querySelector(".youtube-result-title").textContent = entry.title;
      const replayYoutube = entry.type === "youtube" && entry.videoId;
      const replayDrive = entry.type === "gdrive" && entry.fileId;
      btn.querySelector(".youtube-result-channel").textContent = replayYoutube
        ? `${formatPlayedAt(entry.playedAt)} · tap to play or queue`
        : replayDrive
          ? `${formatPlayedAt(entry.playedAt)} · Google Drive · tap to play or queue`
          : `${formatPlayedAt(entry.playedAt)} · local file (load the file again to replay)`;
      btn.disabled = !replayYoutube && !replayDrive;
      if (replayYoutube) {
        btn.addEventListener("click", () => playOrQueue(youtubeTrack(entry.videoId, entry.title)));
      } else if (replayDrive) {
        btn.addEventListener("click", () => playOrQueue(gdriveTrack(entry.fileId, entry.title)));
      }
      li.appendChild(btn);
      historyList.appendChild(li);
    });
  }

  function clearPlayHistory() {
    savePlayHistory([]);
    renderPlayHistory();
    emitLocalStateChange();
  }

  function isPlaybackActive() {
    if (playbackMode === "none" || !wrap.classList.contains("has-source")) return false;
    if (isHtml5Mode()) return !video.ended && !!(video.src || video.currentSrc);
    if (playbackMode === "gdrive-embed") return !!gdriveHost && !gdriveHost.hidden;
    if (playbackMode === "youtube") {
      const yt = getYoutubePlayer();
      if (!yt || typeof yt.getPlayerState !== "function") return true;
      return yt.getPlayerState() !== window.YT.PlayerState.ENDED;
    }
    return false;
  }

  function renderQueue() {
    if (reservedCount) {
      reservedCount.textContent = `R: ${playQueue.length}`;
      reservedCount.setAttribute(
        "aria-label",
        `${playQueue.length} reserved song${playQueue.length === 1 ? "" : "s"} in Up Next`
      );
    }
    if (!queueList) return;
    if (queueEmpty) queueEmpty.classList.toggle("hidden", playQueue.length > 0);
    if (tabBadgeUpnext) {
      if (playQueue.length > 0) {
        tabBadgeUpnext.textContent = String(playQueue.length);
        tabBadgeUpnext.classList.remove("hidden");
      } else {
        tabBadgeUpnext.classList.add("hidden");
      }
    }
    queueList.innerHTML = "";
    playQueue.forEach((item, index) => {
      const li = document.createElement("li");
      li.className = "queue-item";
      const pos = document.createElement("span");
      pos.className = "queue-item-pos";
      pos.textContent = String(index + 1);
      const title = document.createElement("p");
      title.className = "queue-item-title";
      title.textContent = item.title;
      const type = document.createElement("span");
      type.className = "queue-item-type";
      type.textContent = item.type === "youtube" ? "YouTube" : item.type === "gdrive" ? "Drive" : "File";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "queue-item-remove";
      remove.setAttribute("aria-label", `Remove ${item.title} from queue`);
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        removeQueueAt(index);
      });
      li.append(pos, title, type, remove);
      queueList.appendChild(li);
    });
  }

  function removeQueueAt(index) {
    if (index < 0 || index >= playQueue.length) return;
    playQueue.splice(index, 1);
    renderQueue();
    emitLocalStateChange();
  }

  function enqueueTrack(item) {
    playQueue.push(item);
    renderQueue();
    setYoutubeMessage(`Added to queue (#${playQueue.length})`, false);
    if (!settingsPanel.hidden) switchSettingsTab("upnext");
    emitLocalStateChange();
  }

  function showReservedToast() {
    lastReserveNotice = { id: Date.now(), message: "Successfully Reserved" };
    const toast = document.getElementById("reserve-toast");
    if (toast) {
      toast.textContent = lastReserveNotice.message;
      toast.classList.add("is-visible");
      clearTimeout(reserveToastTimer);
      reserveToastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
    }
    emitLocalStateChange();
  }

  function didReservationStart(item) {
    if (item.type === "youtube") return playbackMode === "youtube";
    if (item.type === "gdrive") return playbackMode === "gdrive" || playbackMode === "gdrive-embed";
    if (item.file) return playbackMode === "file";
    return false;
  }

  async function playOrQueue(item) {
    if (isPlaybackActive()) {
      enqueueTrack(item);
      showReservedToast();
      return;
    }
    await playItemNow(item);
    if (didReservationStart(item)) showReservedToast();
  }

  async function playItemNow(item) {
    suppressEndedAdvance = true;
    try {
      if (item.type === "youtube") {
        await loadYoutubeVideo(item.videoId, item.title);
        if (playbackMode === "youtube") {
          recordPlayHistory(item);
          emitLocalStateChange();
        }
      } else if (item.type === "gdrive") {
        await loadGdriveVideo(item.fileId, item.title);
        if (playbackMode === "gdrive" || playbackMode === "gdrive-embed") {
          recordPlayHistory(item);
          emitLocalStateChange();
        }
      } else if (item.file) {
        loadFile(item.file);
        recordPlayHistory(item);
        emitLocalStateChange();
      }
    } finally {
      suppressEndedAdvance = false;
    }
  }

  function showSelectSong() {
    suppressEndedAdvance = true;
    try {
      stopYtProgressTimer();
      window.OVPYouTube?.destroyPlayer?.();
      if (youtubeHost) {
        youtubeHost.innerHTML = "";
        youtubeHost.hidden = true;
      }
      clearDriveEmbedTimer();
      driveEmbedFileId = null;
      driveEmbedPaused = false;
      if (gdriveHost) {
        gdriveHost.innerHTML = "";
        gdriveHost.hidden = true;
      }
      video.pause();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
      video.removeAttribute("src");
      video.load();
      playbackMode = "none";
      wrap.classList.remove("has-source", "mode-youtube", "mode-gdrive-embed", "show-center-play");
      playerFrame.classList.remove("youtube-active");
      nowPlayingTitle.textContent = "—";
      setPlayingUI(false);
    } finally {
      suppressEndedAdvance = false;
    }
    emitLocalStateChange();
  }

  async function playNextFromQueue() {
    if (suppressEndedAdvance) return;
    if (!playQueue.length) {
      showSelectSong();
      return;
    }
    while (playQueue.length) {
      const next = playQueue.shift();
      renderQueue();
      try {
        await playItemNow(next);
        return;
      } catch {
        /* try next queued item */
      }
    }
  }

  function handlePlaybackEnded() {
    if (suppressEndedAdvance) return;
    void playNextFromQueue();
  }

  function clearYoutubeSource() {
    suppressEndedAdvance = true;
    stopYtProgressTimer();
    window.OVPYouTube.destroyPlayer();
    youtubeHost.innerHTML = "";
    youtubeHost.hidden = true;
    wrap.classList.remove("mode-youtube");
    playerFrame.classList.remove("youtube-active");
  }

  function clearDriveEmbedTimer() {
    if (driveEmbedTimer) {
      clearTimeout(driveEmbedTimer);
      driveEmbedTimer = null;
    }
  }

  function clearGdriveEmbed() {
    clearDriveEmbedTimer();
    driveEmbedFileId = null;
    driveEmbedPaused = false;
    if (!gdriveHost) return;
    gdriveHost.innerHTML = "";
    gdriveHost.hidden = true;
    wrap.classList.remove("mode-gdrive-embed");
  }

  function defaultDriveFolder() {
    const url = (window.OVP_CONFIG?.gdriveFolderUrl || "").trim();
    const id = window.OVPDrive?.parseFolderId?.(url);
    return id ? { id, url } : null;
  }

  function getSavedDriveFolder() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_DRIVE_FOLDER) || "null");
      if (stored?.id) return stored;
    } catch {
      /* ignore */
    }
    return defaultDriveFolder();
  }

  function saveDriveFolder(folder) {
    try {
      if (!folder) localStorage.removeItem(STORAGE_DRIVE_FOLDER);
      else localStorage.setItem(STORAGE_DRIVE_FOLDER, JSON.stringify(folder));
    } catch {
      /* ignore */
    }
  }

  function fillDriveFolderInput() {
    const saved = getSavedDriveFolder();
    if (gdriveFolderUrl) gdriveFolderUrl.value = saved?.url || "";
  }

  function mediaSourceLabel(item) {
    return item?.source === "gdrive" || item?.type === "gdrive" ? "drive" : "youtube";
  }

  function appendMediaResult(container, item, onPick) {
    const li = document.createElement("li");
    const source = mediaSourceLabel(item);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "youtube-result-btn";
    const thumb =
      item.thumbnail ||
      (source === "drive" && item.id
        ? window.OVPDrive?.thumbnailUrl?.(item.id)
        : item.id
          ? `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`
          : "");
    btn.innerHTML = `
      ${thumb ? `<img class="youtube-result-thumb" src="${thumb}" alt="" loading="lazy" />` : `<span class="history-file-thumb" aria-hidden="true">${source === "drive" ? "DRIVE" : "YT"}</span>`}
      <div class="youtube-result-meta">
        <p class="youtube-result-title"></p>
        <p class="youtube-result-channel"></p>
      </div>
    `;
    btn.querySelector(".youtube-result-title").textContent = item.title || "Untitled";
    const channel = btn.querySelector(".youtube-result-channel");
    const badge = document.createElement("span");
    badge.className = `source-badge source-badge-${source}`;
    badge.textContent = source === "drive" ? "Drive" : "YouTube";
    channel.append(badge, document.createTextNode(item.channel || (source === "drive" ? "Google Drive" : "YouTube")));
    btn.addEventListener("click", () => onPick(item));
    li.appendChild(btn);
    container.appendChild(li);
  }

  function matchDriveLibrary(query) {
    const q = String(query || "")
      .trim()
      .toLowerCase();
    if (!q) return driveLibraryItems.slice();
    return driveLibraryItems.filter((item) => String(item.title || "").toLowerCase().includes(q));
  }

  function renderDriveLibrary() {
    if (!driveLibraryEl) return;
    driveLibraryEl.innerHTML = "";
    driveLibraryItems.forEach((item) => {
      appendMediaResult(driveLibraryEl, { ...item, source: "gdrive", channel: "Google Drive" }, (entry) => {
        void playOrQueue(gdriveTrack(entry.id, entry.title));
      });
    });
  }

  function setDriveLibraryStatus(text, isError) {
    if (!driveLibraryStatus) return;
    driveLibraryStatus.textContent = text;
    driveLibraryStatus.classList.toggle("err", !!isError);
  }

  async function refreshDriveLibrary() {
    const saved = getSavedDriveFolder();
    if (!saved?.id) {
      driveLibraryItems = [];
      renderDriveLibrary();
      setDriveLibraryStatus("No Drive folder saved yet. Add one in Config.");
      return;
    }
    if (!hasActiveApiKey()) {
      driveLibraryItems = [];
      renderDriveLibrary();
      setDriveLibraryStatus("Add an API key in Config, and enable Google Drive API for that key.", true);
      return;
    }
    setDriveLibraryStatus("Loading Drive folder…");
    try {
      driveLibraryItems = await runWithApiKeys((apiKey) => window.OVPDrive.listFolderVideos(saved.id, apiKey));
      renderDriveLibrary();
      setDriveLibraryStatus(
        driveLibraryItems.length
          ? `${driveLibraryItems.length} videos in your Drive folder — tap to play or queue.`
          : "Folder opened, but no video files were found. Upload MP4s and share them as Anyone with the link."
      );
      emitLocalStateChange();
    } catch (err) {
      driveLibraryItems = [];
      renderDriveLibrary();
      setDriveLibraryStatus(err.message || "Could not load the Drive folder.", true);
    }
  }

  function scheduleDriveEmbedAdvance(fileId) {
    clearDriveEmbedTimer();
    void (async () => {
      let durationMs = 0;
      try {
        if (hasActiveApiKey()) {
          const meta = await runWithApiKeys((apiKey) => window.OVPDrive.getFileMeta(fileId, apiKey));
          durationMs = Number(meta?.videoMediaMetadata?.durationMillis) || 0;
        }
      } catch {
        durationMs = 0;
      }
      if (!durationMs || playbackMode !== "gdrive-embed") return;
      driveEmbedTimer = setTimeout(() => {
        driveEmbedTimer = null;
        if (playbackMode === "gdrive-embed") handlePlaybackEnded();
      }, durationMs + 1200);
    })();
  }

  function loadGdriveEmbed(fileId, title) {
    clearFileSource();
    clearYoutubeSource();
    playbackMode = "gdrive-embed";
    driveEmbedFileId = fileId;
    driveEmbedPaused = false;
    wrap.classList.add("has-source", "mode-gdrive-embed");
    wrap.classList.remove("mode-youtube", "show-center-play");
    playerFrame.classList.remove("youtube-active");
    if (gdriveHost) {
      gdriveHost.hidden = false;
      gdriveHost.removeAttribute("hidden");
      gdriveHost.innerHTML = "";
      const iframe = document.createElement("iframe");
      iframe.src = `${window.OVPDrive.embedUrl(fileId)}?usp=drivesdk&autoplay=1&mute=0`;
      iframe.setAttribute("allow", "autoplay; encrypted-media; fullscreen; picture-in-picture");
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.title = title || "Google Drive video";
      gdriveHost.appendChild(iframe);
    }
    nowPlayingTitle.textContent = title || "Google Drive video";
    setPlayingUI(true);
    setYoutubeMessage("");
    hideYoutubeResults();
    scheduleDriveEmbedAdvance(fileId);
    emitLocalStateChange();
  }

  function playDriveInVideoElement(url) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => finish(new Error("timeout")), 12000);

      function finish(err) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        video.removeEventListener("error", onErr);
        video.removeEventListener("playing", onPlaying);
        if (err) reject(err);
        else resolve();
      }

      function onErr() {
        finish(new Error("Could not stream this Drive file."));
      }

      function onPlaying() {
        if (!video.videoWidth && !video.videoHeight) {
          finish(new Error("Drive stream had no video."));
          return;
        }
        finish();
      }

      video.addEventListener("error", onErr, { once: true });
      video.addEventListener("playing", onPlaying, { once: true });
      video.controls = false;
      video.autoplay = true;
      video.muted = false;
      video.volume = parseFloat(volumeInput.value);
      if (video.volume === 0) video.volume = 0.85;
      video.src = url;
      const attempt = video.play();
      if (attempt && typeof attempt.catch === "function") {
        attempt.catch(async () => {
          try {
            video.muted = true;
            await video.play();
            video.muted = false;
          } catch (err) {
            finish(err);
          }
        });
      }
    });
  }

  async function loadGdriveVideo(fileId, title) {
    if (!fileId) throw new Error("Missing Google Drive file.");

    clearYoutubeSource();
    clearGdriveEmbed();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    wrap.classList.remove("mode-youtube", "mode-gdrive-embed");
    playerFrame.classList.remove("youtube-active");

    playbackMode = "gdrive";
    wrap.classList.add("has-source");
    nowPlayingTitle.textContent = title || "Google Drive video";
    setYoutubeMessage("Starting Google Drive video…");
    hideYoutubeResults();

    const keys = getApiKeysList().filter((e) => !isKeyExhausted(e.key));
    const urls = window.OVPDrive.streamUrls(fileId, keys[0]?.key);

    for (let i = 0; i < urls.length; i += 1) {
      try {
        await playDriveInVideoElement(urls[i]);
        setYoutubeMessage("");
        setPlayingUI(true);
        emitLocalStateChange();
        return;
      } catch {
        /* try next stream URL */
      }
    }

    loadGdriveEmbed(fileId, title);
  }

  function setYoutubeMessage(text, isError) {
    if (!text) {
      youtubeMessage.classList.add("hidden");
      youtubeMessage.textContent = "";
      youtubeMessage.classList.remove("err");
      return;
    }
    youtubeMessage.textContent = text;
    youtubeMessage.classList.remove("hidden");
    youtubeMessage.classList.toggle("err", !!isError);
  }

  function hideYoutubeResults() {
    youtubeResults.classList.add("hidden");
    youtubeResults.innerHTML = "";
  }

  function renderYoutubeResults(items) {
    youtubeResults.innerHTML = "";
    if (!items.length) {
      hideYoutubeResults();
      setYoutubeMessage("No videos found. Try another search.", true);
      return;
    }
    youtubeResults.classList.remove("hidden");
    const driveCount = items.filter((item) => mediaSourceLabel(item) === "drive").length;
    const ytCount = items.length - driveCount;
    const parts = [];
    if (driveCount) parts.push(`${driveCount} Drive`);
    if (ytCount) parts.push(`${ytCount} YouTube`);
    setYoutubeMessage(`${parts.join(" · ")} result${items.length === 1 ? "" : "s"}.`);

    items.forEach((item) => {
      appendMediaResult(youtubeResults, item, (entry) => {
        if (mediaSourceLabel(entry) === "drive") {
          void playOrQueue(gdriveTrack(entry.id, entry.title));
          return;
        }
        void playOrQueue(youtubeTrack(entry.id, entry.title));
      });
    });
  }

  async function loadYoutubeVideo(videoId, title) {
    if (!window.OVPYouTube.canEmbed()) {
      setYoutubeMessage(
        "YouTube Error 153 fix: do not open index.html as a file. Run start-server.bat, then use http://localhost:8080 in your browser.",
        true
      );
      refreshFileProtocolBanner();
      return;
    }

    setYoutubeMessage("Loading video…");
    clearFileSource();
    clearGdriveEmbed();
    clearYoutubeSource();

    playbackMode = "youtube";
    youtubeWantsAutoplay = true;
    wrap.classList.add("has-source", "mode-youtube");
    playerFrame.classList.add("youtube-active");
    youtubeHost.hidden = false;
    nowPlayingTitle.textContent = title || "YouTube video";

    let autoplayTries = 0;
    const startYoutubePlayback = (yt) => {
      const vol = Math.round(parseFloat(volumeInput.value) * 100);
      try {
        yt.setVolume(vol);
        if (vol === 0) yt.mute();
        else yt.unMute();
        yt.playVideo();
      } catch {
        /* player not ready yet */
      }
    };

    try {
      await window.OVPYouTube.mountPlayer("youtube-player", videoId, {
        onReady: (e) => {
          startYoutubePlayback(e.target);
          updateProgress();
          setYoutubeMessage("");
          hideYoutubeResults();
          scheduleLayoutRefresh();
          emitLocalStateChange();
        },
        onStateChange: (e) => {
          const playing = e.data === window.YT.PlayerState.PLAYING;
          const paused = e.data === window.YT.PlayerState.PAUSED;
          const ended = e.data === window.YT.PlayerState.ENDED;
          const waiting =
            e.data === window.YT.PlayerState.CUED || e.data === window.YT.PlayerState.UNSTARTED;
          if (youtubeWantsAutoplay && waiting && autoplayTries < 4) {
            autoplayTries += 1;
            startYoutubePlayback(e.target);
          }
          if (playing) {
            youtubeWantsAutoplay = false;
            autoplayTries = 4;
            setPlayingUI(true);
            startYtProgressTimer();
            wrap.classList.remove("show-center-play");
            emitLocalStateChange();
          }
          if (ended) {
            handlePlaybackEnded();
          }
          if (paused || ended) {
            setPlayingUI(false);
            stopYtProgressTimer();
            updateProgress();
            wrap.classList.add("show-center-play");
            emitLocalStateChange();
          }
        },
        onError: () => {
          setYoutubeMessage("Could not play this video. It may be restricted.", true);
          playbackMode = "none";
          wrap.classList.remove("has-source", "mode-youtube");
          playerFrame.classList.remove("youtube-active");
          handlePlaybackEnded();
        },
      });
    } catch (err) {
      setYoutubeMessage(err.message || "Failed to load YouTube video.", true);
      playbackMode = "none";
      wrap.classList.remove("has-source", "mode-youtube");
      playerFrame.classList.remove("youtube-active");
    }
  }

  function loadFile(file) {
    if (!file || !file.type.startsWith("video/")) return;
    clearYoutubeSource();
    clearGdriveEmbed();
    playbackMode = "file";
    wrap.classList.remove("mode-youtube", "mode-gdrive-embed");

    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;
    wrap.classList.add("has-source");
    nowPlayingTitle.textContent = file.name.replace(/\.[^.]+$/, "");
    video.load();
    setYoutubeMessage("");
    hideYoutubeResults();
    emitLocalStateChange();
  }

  youtubeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = youtubeQuery.value.trim();
    if (!query) return;

    const driveFolderId = window.OVPDrive?.parseFolderId?.(query);
    if (driveFolderId) {
      saveDriveFolder({ id: driveFolderId, url: query });
      fillDriveFolderInput();
      setYoutubeMessage("Drive folder saved. Loading videos…");
      await refreshDriveLibrary();
      return;
    }

    const driveFileId = window.OVPDrive?.parseFileId?.(query);
    if (driveFileId) {
      btnYoutubeSearch.disabled = true;
      setYoutubeMessage("Loading Google Drive video…");
      try {
        let title = "Google Drive video";
        if (hasActiveApiKey()) {
          try {
            const meta = await runWithApiKeys((apiKey) => window.OVPDrive.getFileMeta(driveFileId, apiKey));
            title = (meta.name || title).replace(/\.[^.]+$/, "");
          } catch {
            /* play anyway */
          }
        }
        await playOrQueue(gdriveTrack(driveFileId, title));
      } catch (err) {
        setYoutubeMessage(err.message || "Failed to load Google Drive video.", true);
      } finally {
        btnYoutubeSearch.disabled = false;
      }
      return;
    }

    const directId = window.OVPYouTube.parseVideoId(query);

    if (directId) {
      btnYoutubeSearch.disabled = true;
      setYoutubeMessage("Loading video…");
      try {
        const meta = hasAnyApiKey()
          ? await runWithApiKeys((apiKey) => window.OVPYouTube.resolveDirectVideo(query, apiKey))
          : await window.OVPYouTube.resolveDirectVideo(query, "");
        await playOrQueue(youtubeTrack(meta.id, meta.title));
      } catch (err) {
        setYoutubeMessage(err.message || "Failed to load YouTube video.", true);
      } finally {
        btnYoutubeSearch.disabled = false;
      }
      return;
    }

    const driveHits = matchDriveLibrary(query).map((item) => ({
      ...item,
      source: "gdrive",
      channel: "Google Drive",
    }));

    if (!hasActiveApiKey()) {
      if (driveHits.length) {
        renderYoutubeResults(driveHits);
        return;
      }
      setYoutubeMessage("Add your YouTube API key in Settings to search YouTube (Drive songs still appear in the list above).", true);
      setSettingsOpen(true, { tab: "config" });
      return;
    }

    if (location.protocol === "file:") {
      setYoutubeMessage(
        "YouTube search needs a local server (e.g. Live Server on http://localhost). Paste a video link to play without search.",
        true
      );
    }

    btnYoutubeSearch.disabled = true;
    setYoutubeMessage("Searching…");

    try {
      const ytItems = (await runWithApiKeys((apiKey) => window.OVPYouTube.search(query, apiKey))).map((item) => ({
        ...item,
        source: "youtube",
      }));
      renderYoutubeResults([...driveHits, ...ytItems]);
    } catch (err) {
      if (driveHits.length) {
        renderYoutubeResults(driveHits);
        setYoutubeMessage(`${err.message || "YouTube search failed."} Showing Drive matches.`, true);
      } else {
        renderYoutubeResults([]);
        setYoutubeMessage(err.message || "Search failed.", true);
      }
    } finally {
      btnYoutubeSearch.disabled = false;
    }
  });

  video.volume = parseFloat(volumeInput.value);

  btnPlay.addEventListener("click", togglePlay);
  btnCenterPlay.addEventListener("click", togglePlay);
  wrap.addEventListener("click", (e) => {
    if (playbackMode !== "youtube" && !isHtml5Mode()) return;
    if (e.target.closest(".center-play, .ctrl-btn, button")) return;
    if (isHtml5Mode() && e.target === video) togglePlay();
    if (playbackMode === "youtube" && e.target.closest(".video-wrap")) togglePlay();
  });

  btnNext.addEventListener("click", () => {
    void skipToNext();
  });

  video.addEventListener("play", () => {
    if (isHtml5Mode()) setPlayingUI(true);
  });
  video.addEventListener("pause", () => {
    if (isHtml5Mode()) setPlayingUI(false);
  });
  video.addEventListener("timeupdate", () => {
    if (isHtml5Mode()) updateProgress();
  });
  video.addEventListener("loadedmetadata", updateProgress);
  video.addEventListener("progress", updateBuffer);
  video.addEventListener("ended", () => {
    if (!isHtml5Mode()) return;
    setPlayingUI(false);
    wrap.classList.add("show-center-play");
    handlePlaybackEnded();
  });

  progressInput.addEventListener("input", () => {
    const pct = parseFloat(progressInput.value) / 100;
    if (playbackMode === "youtube") {
      const yt = getYoutubePlayer();
      const duration = yt?.getDuration?.() || 0;
      if (yt && duration) yt.seekTo(pct * duration, true);
      updateProgress();
      return;
    }
    if (!video.duration) return;
    video.currentTime = pct * video.duration;
    updateProgress();
  });

  volumeInput.addEventListener("input", () => {
    const vol = parseFloat(volumeInput.value);
    if (playbackMode === "youtube") {
      const yt = getYoutubePlayer();
      const pct = Math.round(vol * 100);
      if (yt) {
        if (pct === 0) yt.mute();
        else {
          yt.unMute();
          yt.setVolume(pct);
        }
      }
      return;
    }
    video.volume = vol;
    video.muted = vol === 0;
  });

  btnMute.addEventListener("click", () => {
    if (playbackMode === "youtube") {
      const yt = getYoutubePlayer();
      if (!yt) return;
      if (yt.isMuted()) {
        yt.unMute();
        yt.setVolume(lastVolume || 85);
        volumeInput.value = String((lastVolume || 85) / 100);
      } else {
        lastVolume = yt.getVolume();
        yt.mute();
        volumeInput.value = "0";
      }
      return;
    }
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) {
      video.volume = 0.5;
      volumeInput.value = "0.5";
    }
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) void playOrQueue(fileTrack(file));
    fileInput.value = "";
  });

  btnClearQueue?.addEventListener("click", () => {
    clearQueue();
    setYoutubeMessage("Queue cleared.", false);
  });

  btnClearHistory?.addEventListener("click", () => {
    clearPlayHistory();
  });

  btnSaveGdriveFolder?.addEventListener("click", () => {
    const raw = (gdriveFolderUrl?.value || "").trim();
    if (!raw) {
      saveDriveFolder(null);
      driveLibraryItems = [];
      renderDriveLibrary();
      setDriveLibraryStatus("No Drive folder saved yet. Add one in Config.");
      if (gdriveFolderStatus) {
        gdriveFolderStatus.textContent = "Drive folder cleared.";
        gdriveFolderStatus.className = "settings-status ok";
      }
      emitLocalStateChange();
      return;
    }
    const folderId = window.OVPDrive?.parseFolderId?.(raw);
    if (!folderId) {
      if (gdriveFolderStatus) {
        gdriveFolderStatus.textContent = "Paste a Google Drive folder link (drive.google.com/drive/folders/...).";
        gdriveFolderStatus.className = "settings-status err";
      }
      return;
    }
    saveDriveFolder({ id: folderId, url: raw });
    if (gdriveFolderStatus) {
      gdriveFolderStatus.textContent = "Drive folder saved. Open Songs to browse videos.";
      gdriveFolderStatus.className = "settings-status ok";
    }
    void refreshDriveLibrary();
  });

  fillDriveFolderInput();
  void refreshDriveLibrary();

  function clearQueue() {
    playQueue = [];
    renderQueue();
    emitLocalStateChange();
  }

  function getIsPlaying() {
    if (playbackMode === "youtube") {
      const yt = getYoutubePlayer();
      return yt?.getPlayerState?.() === window.YT?.PlayerState?.PLAYING;
    }
    if (isHtml5Mode()) return !video.paused && !video.ended;
    if (playbackMode === "gdrive-embed") return !driveEmbedPaused;
    return false;
  }

  function setVolumeLevel(value) {
    const v = Math.min(1, Math.max(0, value));
    volumeInput.value = String(v);
    volumeInput.dispatchEvent(new Event("input", { bubbles: true }));
    emitLocalStateChange();
  }

  async function skipToNext() {
    if (!playQueue.length) return;
    suppressEndedAdvance = true;
    stopYtProgressTimer();
    if (playbackMode === "youtube") {
      window.OVPYouTube.destroyPlayer();
      youtubeHost.innerHTML = "";
    } else if (isHtml5Mode()) {
      video.pause();
    } else if (playbackMode === "gdrive-embed") {
      clearGdriveEmbed();
    }
    const next = playQueue.shift();
    renderQueue();
    try {
      await playItemNow(next);
    } finally {
      suppressEndedAdvance = false;
      emitLocalStateChange();
    }
  }

  async function searchYoutube(query) {
    const q = (query || "").trim();
    if (!q) return [];
    const driveFolderId = window.OVPDrive?.parseFolderId?.(q);
    if (driveFolderId) {
      saveDriveFolder({ id: driveFolderId, url: q });
      const items = hasActiveApiKey()
        ? await runWithApiKeys((apiKey) => window.OVPDrive.listFolderVideos(driveFolderId, apiKey))
        : [];
      driveLibraryItems = items;
      renderDriveLibrary();
      return items;
    }
    const driveFileId = window.OVPDrive?.parseFileId?.(q);
    if (driveFileId) {
      let title = "Google Drive video";
      if (hasActiveApiKey()) {
        try {
          const meta = await runWithApiKeys((apiKey) => window.OVPDrive.getFileMeta(driveFileId, apiKey));
          title = (meta.name || title).replace(/\.[^.]+$/, "");
        } catch {
          /* keep default title */
        }
      }
      return [
        {
          id: driveFileId,
          title,
          channel: "Google Drive",
          source: "gdrive",
          thumbnail: window.OVPDrive.thumbnailUrl(driveFileId),
        },
      ];
    }
    const directId = window.OVPYouTube.parseVideoId(q);
    if (directId) {
      const meta = hasAnyApiKey()
        ? await runWithApiKeys((apiKey) => window.OVPYouTube.resolveDirectVideo(q, apiKey))
        : await window.OVPYouTube.resolveDirectVideo(q, "");
      return [
        {
          id: meta.id,
          title: meta.title,
          channel: meta.channel,
          thumbnail: meta.thumbnail,
          source: "youtube",
        },
      ];
    }
    const driveHits = matchDriveLibrary(q).map((item) => ({
      ...item,
      source: "gdrive",
      channel: "Google Drive",
    }));
    if (!hasActiveApiKey()) {
      if (driveHits.length) return driveHits;
      throw new Error("Host needs an active YouTube API key in Config.");
    }
    try {
      const ytItems = (await runWithApiKeys((apiKey) => window.OVPYouTube.search(q, apiKey))).map((item) => ({
        ...item,
        source: "youtube",
      }));
      return [...driveHits, ...ytItems];
    } catch (err) {
      if (driveHits.length) return driveHits;
      throw err;
    }
  }

  let pseudoFullscreen = false;
  let fullscreenPrompt = null;
  const rootEl = document.documentElement;

  function getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function isPlayerFullscreen() {
    return !!getFullscreenElement() || pseudoFullscreen;
  }

  function exitDocumentFullscreen() {
    if (!getFullscreenElement()) return;
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) exit.call(document);
  }

  function requestDocumentFullscreen() {
    if (typeof rootEl.requestFullscreen === "function") {
      try {
        return rootEl.requestFullscreen({ navigationUI: "hide" });
      } catch {
        return rootEl.requestFullscreen();
      }
    }
    if (typeof rootEl.webkitRequestFullscreen === "function") {
      rootEl.webkitRequestFullscreen();
    }
    return null;
  }

  function dismissFullscreenPrompt() {
    fullscreenPrompt?.remove();
    fullscreenPrompt = null;
  }

  function exitPlayerFullscreen() {
    pseudoFullscreen = false;
    dismissFullscreenPrompt();
    playerFrame.classList.remove("is-pseudo-fullscreen");
    document.body.classList.remove("ovp-pseudo-fullscreen");
    exitDocumentFullscreen();
  }

  function enterPseudoFullscreen() {
    pseudoFullscreen = true;
    document.body.classList.add("ovp-pseudo-fullscreen");
    scheduleLayoutRefresh();
    emitLocalStateChange();
  }

  function showFullscreenPrompt() {
    if (fullscreenPrompt || getFullscreenElement()) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fullscreen-prompt";
    btn.textContent = "Click to enter fullscreen";
    btn.addEventListener("click", () => {
      dismissFullscreenPrompt();
      const req = requestDocumentFullscreen();
      if (req && typeof req.then === "function") {
        req.then(() => {
          pseudoFullscreen = false;
          document.body.classList.remove("ovp-pseudo-fullscreen");
        }).catch(() => enterPseudoFullscreen());
      } else if (!getFullscreenElement()) {
        enterPseudoFullscreen();
      }
    });
    document.body.appendChild(btn);
    fullscreenPrompt = btn;
  }

  function toggleFullscreen() {
    if (pseudoFullscreen || getFullscreenElement()) {
      exitPlayerFullscreen();
      scheduleLayoutRefresh();
      emitLocalStateChange();
      return;
    }
    let req = null;
    try {
      req = requestDocumentFullscreen();
    } catch {
      req = null;
    }
    if (req && typeof req.then === "function") {
      req.catch(() => showFullscreenPrompt());
      return;
    }
    if (!getFullscreenElement()) showFullscreenPrompt();
  }

  function getApiKeySummary() {
    const keys = getApiKeysList();
    const active = keys.filter((e) => !isKeyExhausted(e.key)).length;
    return {
      total: keys.length,
      active,
      canSearch: active > 0,
    };
  }

  function getPublicState() {
    return {
      nowPlaying: nowPlayingTitle.textContent,
      playbackMode,
      isPlaying: getIsPlaying(),
      isFullscreen: isPlayerFullscreen(),
      reserveNotice: lastReserveNotice,
      apiKeys: getApiKeySummary(),
      volume: parseFloat(volumeInput.value),
      queue: playQueue.map((item) => ({
        type: item.type,
        title: item.title,
        videoId: item.videoId || item.fileId,
      })),
      history: loadPlayHistory()
        .filter((e) => (e.type === "youtube" && e.videoId) || (e.type === "gdrive" && e.fileId))
        .slice(0, 40)
        .map((e) => ({
          type: e.type,
          title: e.title,
          videoId: e.videoId || e.fileId,
          fileId: e.fileId,
          playedAt: e.playedAt,
        })),
      driveLibrary: driveLibraryItems,
    };
  }

  btnFullscreen.addEventListener("click", () => toggleFullscreen());

  function onFullscreenChange() {
    if (getFullscreenElement()) {
      pseudoFullscreen = false;
      dismissFullscreenPrompt();
      playerFrame.classList.remove("is-pseudo-fullscreen");
      document.body.classList.remove("ovp-pseudo-fullscreen");
    }
    scheduleLayoutRefresh();
    emitLocalStateChange();
  }

  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onFullscreenChange);

  wrap.addEventListener("mouseleave", () => wrap.classList.remove("show-center-play"));
  video.addEventListener("pause", () => {
    if (isHtml5Mode()) wrap.classList.add("show-center-play");
  });
  video.addEventListener("play", () => {
    if (isHtml5Mode()) wrap.classList.remove("show-center-play");
  });

  const fileBanner = document.getElementById("youtube-file-banner");
  const localUrlHint = document.getElementById("local-url-hint");

  function refreshFileProtocolBanner() {
    if (!fileBanner) return;
    const onFile = location.protocol === "file:";
    fileBanner.classList.toggle("hidden", !onFile);
    if (onFile && localUrlHint) {
      localUrlHint.textContent = "http://localhost:8080";
    }
  }

  refreshFileProtocolBanner();
  renderQueue();
  renderPlayHistory();

  if (typeof ResizeObserver !== "undefined") {
    const layoutObserver = new ResizeObserver(() => notifyPlayerLayoutChange());
    if (appRoot) layoutObserver.observe(appRoot);
    layoutObserver.observe(wrap);
    if (playerFrame) layoutObserver.observe(playerFrame);
  }

  window.OVP = {
    togglePlay,
    skipToNext,
    setVolumeLevel,
    playOrQueueYoutube: (videoId, title) => playOrQueue(youtubeTrack(videoId, title)),
    playOrQueueGdrive: (fileId, title) => playOrQueue(gdriveTrack(fileId, title)),
    clearQueue,
    removeQueueAt,
    searchYoutube,
    refreshDriveLibrary,
    clearQuotaFlags,
    toggleFullscreen,
    getState: getPublicState,
  };

  video.addEventListener("play", emitLocalStateChange);
  video.addEventListener("pause", emitLocalStateChange);

  (function migrateLegacyApiKey() {
    try {
      if (localStorage.getItem(STORAGE_KEYS)) return;
      const legacy = localStorage.getItem(STORAGE_KEY_LEGACY)?.trim();
      if (legacy) saveApiKeysList([{ id: "legacy", label: "Key 1", key: legacy }]);
    } catch {
      /* ignore */
    }
  })();

  renderApiKeysList();
  window.OVPYouTube.loadIframeApi().catch(() => {});
  emitLocalStateChange();
})();
