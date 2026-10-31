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
  let upNextTimer = null;
  let upNextHideTimer = null;
  let upNextSongKey = "";
  let upNextShown = { minute: false, soon: false };
  let driveEmbedDurationSec = 0;
  let driveEmbedElapsedSec = 0;
  let driveEmbedClockAt = 0;
  let driveEmbedTimer = null;
  let driveEmbedFileId = null;
  let driveEmbedPaused = false;
  let youtubeWantsAutoplay = false;
  let lastVolume = 85;
  /** @type {{ type: "youtube" | "file"; title: string; videoId?: string; file?: File }[]} */
  let playQueue = [];
  let currentTrack = null;
  let restoringSession = false;
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
      checkUpNext(current, duration);
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
    checkUpNext(current, duration);
  }

  function upNextSongIdentity() {
    if (currentTrack?.type === "youtube" && currentTrack.videoId) return `yt:${currentTrack.videoId}`;
    if (currentTrack?.type === "gdrive" && currentTrack.fileId) return `gd:${currentTrack.fileId}`;
    return currentTrack?.title || playbackMode;
  }

  function hideUpNext(immediate) {
    const banner = document.getElementById("up-next-banner");
    clearTimeout(upNextHideTimer);
    upNextHideTimer = null;
    if (!banner) return;
    if (immediate || banner.hidden) {
      banner.classList.remove("is-fading");
      banner.hidden = true;
      return;
    }
    banner.classList.remove("is-fading");
    void banner.offsetWidth;
    banner.classList.add("is-fading");
    upNextHideTimer = setTimeout(() => {
      banner.hidden = true;
      banner.classList.remove("is-fading");
    }, 900);
  }

  function showUpNext(title) {
    const banner = document.getElementById("up-next-banner");
    const text = document.getElementById("up-next-text");
    if (!banner || !text || !title) return;
    text.textContent = `Up Next - ${title}`;
    banner.hidden = false;
    banner.classList.remove("is-fading");
    void banner.offsetWidth;
    clearTimeout(upNextHideTimer);
    upNextHideTimer = setTimeout(() => hideUpNext(false), 5000);
  }

  function checkUpNext(current, duration) {
    const nextTitle = playQueue[0]?.title || "";
    if (!nextTitle || !duration || !Number.isFinite(current)) {
      if (!nextTitle) hideUpNext(true);
      return;
    }
    const songKey = upNextSongIdentity();
    if (upNextSongKey !== songKey) {
      upNextSongKey = songKey;
      upNextShown = { minute: false, soon: false };
    }
    const remain = duration - current;
    if (remain > 60) {
      upNextShown.minute = false;
      upNextShown.soon = false;
      return;
    }
    if (remain > 30) upNextShown.soon = false;
    if (remain <= 30 && remain > 0 && !upNextShown.soon) {
      upNextShown.soon = true;
      upNextShown.minute = true;
      showUpNext(nextTitle);
      return;
    }
    if (remain <= 60 && remain > 30 && !upNextShown.minute) {
      upNextShown.minute = true;
      showUpNext(nextTitle);
    }
  }

  function syncDriveEmbedClock() {
    const now = performance.now();
    if (!driveEmbedClockAt) driveEmbedClockAt = now;
    if (!driveEmbedPaused) driveEmbedElapsedSec += (now - driveEmbedClockAt) / 1000;
    driveEmbedClockAt = now;
  }

  function stopUpNextWatch() {
    if (upNextTimer) {
      clearInterval(upNextTimer);
      upNextTimer = null;
    }
  }

  function startUpNextWatch() {
    stopUpNextWatch();
    upNextTimer = setInterval(() => {
      if (playbackMode === "gdrive-embed") {
        syncDriveEmbedClock();
        if (driveEmbedDurationSec > 0) checkUpNext(driveEmbedElapsedSec, driveEmbedDurationSec);
        return;
      }
      if (playbackMode === "youtube") updateProgress();
    }, 500);
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
          currentTrack = { type: "youtube", videoId: item.videoId, title: item.title };
          recordPlayHistory(item);
          emitLocalStateChange();
        }
      } else if (item.type === "gdrive") {
        await loadGdriveVideo(item.fileId, item.title);
        if (playbackMode === "gdrive" || playbackMode === "gdrive-embed") {
          currentTrack = { type: "gdrive", fileId: item.fileId, title: item.title };
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
      currentTrack = null;
      stopUpNextWatch();
      hideUpNext(true);
      driveEmbedDurationSec = 0;
      driveEmbedElapsedSec = 0;
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

  function folderFromUrl(url) {
    const raw = String(url || "").trim();
    const id = window.OVPDrive?.parseFolderId?.(raw);
    return id ? { id, url: raw } : null;
  }

  function configuredDriveFolders() {
    const urls = [];
    const single = window.OVP_CONFIG?.gdriveFolderUrl;
    const many = window.OVP_CONFIG?.gdriveFolderUrls;
    if (single) urls.push(single);
    if (Array.isArray(many)) urls.push(...many);
    return urls.map(folderFromUrl).filter(Boolean);
  }

  function readStoredDriveFolders() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_DRIVE_FOLDER) || "null");
      if (Array.isArray(stored)) return stored.filter((folder) => folder?.id);
      if (stored?.id) return [stored];
    } catch {
      /* ignore */
    }
    return [];
  }

  function getDriveFolders() {
    const seen = new Set();
    const folders = [];
    [...configuredDriveFolders(), ...readStoredDriveFolders()].forEach((folder) => {
      if (!folder?.id || seen.has(folder.id)) return;
      seen.add(folder.id);
      folders.push({ id: folder.id, url: folder.url || "" });
    });
    return folders;
  }

  function saveDriveFolders(folders) {
    try {
      if (!folders?.length) localStorage.removeItem(STORAGE_DRIVE_FOLDER);
      else localStorage.setItem(STORAGE_DRIVE_FOLDER, JSON.stringify(folders));
    } catch {
      /* ignore */
    }
  }

  function addDriveFolder(folder) {
    if (!folder?.id) return;
    const folders = getDriveFolders();
    if (!folders.some((item) => item.id === folder.id)) folders.push(folder);
    saveDriveFolders(folders);
  }

  function fillDriveFolderInput() {
    if (!gdriveFolderUrl) return;
    gdriveFolderUrl.value = getDriveFolders()
      .map((folder) => folder.url)
      .filter(Boolean)
      .join("\n");
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

  function appendSongName(container, title, onPick) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "song-name-btn";
    btn.textContent = title || "Untitled";
    btn.addEventListener("click", onPick);
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

  const SONG_LETTERS = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];
  const driveAlpha = document.getElementById("drive-alpha");

  function songIndexLetter(title) {
    const match = String(title || "").trim().match(/[A-Za-z0-9]/);
    if (!match) return "#";
    const ch = match[0].toUpperCase();
    return ch >= "A" && ch <= "Z" ? ch : "#";
  }

  function jumpSongList(container, letter) {
    const heading = [...container.querySelectorAll("[data-letter]")].find((el) => el.dataset.letter === letter);
    if (!heading) return;
    const headings = [...container.querySelectorAll(".song-letter-heading")];
    headings.forEach((el) => el.classList.add("song-letter-measuring"));
    let top = 0;
    let node = heading;
    while (node && node !== container) {
      top += node.offsetTop;
      node = node.offsetParent;
    }
    headings.forEach((el) => el.classList.remove("song-letter-measuring"));
    container.scrollTop = top;
  }

  function renderSongAlpha(bar, present, onJump) {
    if (!bar) return;
    bar.innerHTML = "";
    bar.hidden = present.size === 0;
    SONG_LETTERS.forEach((letter) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "song-alpha-btn";
      btn.textContent = letter;
      btn.disabled = !present.has(letter);
      btn.addEventListener("click", () => {
        bar.querySelectorAll(".song-alpha-btn").forEach((el) => el.classList.remove("is-active"));
        btn.classList.add("is-active");
        onJump(letter);
      });
      bar.appendChild(btn);
    });
  }

  function renderDriveLibrary() {
    if (!driveLibraryEl) return;
    driveLibraryEl.innerHTML = "";
    const groups = new Map();
    driveLibraryItems.forEach((item) => {
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
      driveLibraryEl.appendChild(heading);
      songs.forEach((item) => {
        appendSongName(driveLibraryEl, item.title, () => {
          void playOrQueue(gdriveTrack(item.id, item.title));
        });
      });
    });
    const spacer = document.createElement("li");
    spacer.className = "song-list-spacer";
    spacer.setAttribute("aria-hidden", "true");
    driveLibraryEl.appendChild(spacer);
    renderSongAlpha(driveAlpha, groups, (letter) => jumpSongList(driveLibraryEl, letter));
  }

  function setDriveLibraryStatus(text, isError) {
    if (!driveLibraryStatus) return;
    driveLibraryStatus.textContent = text;
    driveLibraryStatus.classList.toggle("err", !!isError);
  }

  async function refreshDriveLibrary() {
    const folders = getDriveFolders();
    if (!folders.length) {
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
    setDriveLibraryStatus(folders.length > 1 ? "Loading Drive folders…" : "Loading Drive folder…");
    try {
      const loaded = [];
      const errors = [];
      for (const folder of folders) {
        try {
          const items = await runWithApiKeys((apiKey) => window.OVPDrive.listFolderVideos(folder.id, apiKey));
          loaded.push(...items);
        } catch (err) {
          errors.push(err.message || "Could not load a Drive folder.");
        }
      }
      if (!loaded.length && errors.length) throw new Error(errors[0]);
      const seen = new Set();
      driveLibraryItems = loaded.filter((item) => {
        if (!item?.id || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
      driveLibraryItems.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
      renderDriveLibrary();
      const folderLabel = folders.length === 1 ? "Drive folder" : `${folders.length} Drive folders`;
      const note = errors.length ? ` ${errors.length} folder could not be loaded.` : "";
      setDriveLibraryStatus(
        driveLibraryItems.length
          ? `${driveLibraryItems.length} videos in your ${folderLabel} — tap to play or queue.${note}`
          : "Folders opened, but no video files were found. Upload MP4s and share them as Anyone with the link."
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
      if (playbackMode !== "gdrive-embed") return;
      driveEmbedDurationSec = durationMs / 1000;
      if (!durationMs) return;
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
    driveEmbedDurationSec = 0;
    driveEmbedElapsedSec = 0;
    driveEmbedClockAt = performance.now();
    startUpNextWatch();
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
            startUpNextWatch();
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
      addDriveFolder({ id: driveFolderId, url: query });
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
    if (isHtml5Mode()) {
      setPlayingUI(true);
      startUpNextWatch();
    }
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
      saveDriveFolders(null);
      if (gdriveFolderStatus) {
        gdriveFolderStatus.textContent = configuredDriveFolders().length
          ? "Extra folders cleared. The config folders are still used."
          : "Drive folders cleared.";
        gdriveFolderStatus.className = "settings-status ok";
      }
      void refreshDriveLibrary();
      return;
    }
    const lines = raw.split(/\s+/).map((line) => line.trim()).filter(Boolean);
    const folders = [];
    for (const line of lines) {
      const folderId = window.OVPDrive?.parseFolderId?.(line);
      if (!folderId) {
        if (gdriveFolderStatus) {
          gdriveFolderStatus.textContent = "Paste Google Drive folder links, one per line (drive.google.com/drive/folders/...).";
          gdriveFolderStatus.className = "settings-status err";
        }
        return;
      }
      if (!folders.some((folder) => folder.id === folderId)) folders.push({ id: folderId, url: line });
    }
    saveDriveFolders(folders);
    fillDriveFolderInput();
    if (gdriveFolderStatus) {
      gdriveFolderStatus.textContent = folders.length === 1
        ? "Drive folder saved. Open Songs to browse videos."
        : `${folders.length} Drive folders saved. Open Songs to browse videos.`;
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
      addDriveFolder({ id: driveFolderId, url: q });
      fillDriveFolderInput();
      await refreshDriveLibrary();
      return driveLibraryItems.slice();
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

  function trackFromSaved(item) {
    if (!item || typeof item !== "object") return null;
    const title = String(item.title || "").slice(0, 180);
    const videoId = String(item.videoId || "").replace(/[^a-zA-Z0-9_-]/g, "");
    const fileId = String(item.fileId || "").replace(/[^a-zA-Z0-9_-]/g, "");
    if (item.type === "youtube" && videoId) return youtubeTrack(videoId, title);
    if (item.type === "gdrive" && fileId) return gdriveTrack(fileId, title);
    return null;
  }

  async function restoreSession(saved) {
    restoringSession = true;
    try {
      playQueue = (Array.isArray(saved?.queue) ? saved.queue : []).map(trackFromSaved).filter(Boolean).slice(0, 100);
      renderQueue();
      const current = trackFromSaved(saved?.current);
      if (current) await playItemNow(current);
      else showSelectSong();
    } finally {
      restoringSession = false;
      emitLocalStateChange();
    }
  }

  function getPublicState() {
    return {
      nowPlaying: nowPlayingTitle.textContent,
      current: trackFromSaved(currentTrack),
      playbackMode,
      isPlaying: getIsPlaying(),
      isFullscreen: isPlayerFullscreen(),
      reserveNotice: lastReserveNotice,
      apiKeys: getApiKeySummary(),
      volume: parseFloat(volumeInput.value),
      queue: playQueue.map((item) => trackFromSaved(item)).filter(Boolean),
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

  const bgvVideo = document.getElementById("bgv-video");
  let bgvPlaylist = [];
  let bgvOrder = [];

  function shuffleList(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const swap = copy[i];
      copy[i] = copy[j];
      copy[j] = swap;
    }
    return copy;
  }

  function playNextBgv() {
    if (!bgvVideo || !bgvPlaylist.length) return;
    if (!bgvOrder.length) bgvOrder = shuffleList(bgvPlaylist);
    const next = bgvOrder.pop();
    bgvVideo.muted = true;
    bgvVideo.defaultMuted = true;
    bgvVideo.volume = 0;
    if (bgvVideo.getAttribute("src") !== next) bgvVideo.src = next;
    else bgvVideo.currentTime = 0;
    const attempt = bgvVideo.play();
    if (attempt && typeof attempt.catch === "function") attempt.catch(() => {});
  }

  function syncBgv() {
    if (!bgvVideo) return;
    const idle = !wrap.classList.contains("has-source");
    bgvVideo.muted = true;
    bgvVideo.volume = 0;
    if (!idle) {
      bgvVideo.pause();
      return;
    }
    if (!bgvVideo.getAttribute("src") || bgvVideo.ended) playNextBgv();
    else {
      const attempt = bgvVideo.play();
      if (attempt && typeof attempt.catch === "function") attempt.catch(() => {});
    }
  }

  bgvVideo?.addEventListener("loadeddata", () => wrap.classList.add("has-bgv"));
  bgvVideo?.addEventListener("error", () => wrap.classList.remove("has-bgv"));
  bgvVideo?.addEventListener("ended", () => {
    if (!wrap.classList.contains("has-source")) playNextBgv();
  });
  if (bgvVideo && typeof MutationObserver !== "undefined") {
    const bgvObserver = new MutationObserver(() => syncBgv());
    bgvObserver.observe(wrap, { attributes: true, attributeFilter: ["class"] });
  }
  fetch("/api/bgv")
    .then((res) => (res.ok ? res.json() : { videos: [] }))
    .then((data) => {
      bgvPlaylist = Array.isArray(data.videos) ? data.videos : [];
      bgvOrder = [];
      syncBgv();
    })
    .catch(() => {});

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
    restoreSession,
    isRestoring: () => restoringSession,
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
