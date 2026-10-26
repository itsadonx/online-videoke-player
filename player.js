(function () {
  const STORAGE_KEY = "ovp_youtube_api_key";

  const btnSettings = document.getElementById("btn-settings");
  const btnSettingsClose = document.getElementById("btn-settings-close");
  const settingsPanel = document.getElementById("settings-panel");
  const settingsBackdrop = document.getElementById("settings-backdrop");
  const youtubeApiKeyInput = document.getElementById("youtube-api-key");
  const btnSaveApiKey = document.getElementById("btn-save-api-key");
  const apiKeyStatus = document.getElementById("api-key-status");

  const youtubeForm = document.getElementById("youtube-form");
  const youtubeQuery = document.getElementById("youtube-query");
  const btnYoutubeSearch = document.getElementById("btn-youtube-search");
  const youtubeMessage = document.getElementById("youtube-message");
  const youtubeResults = document.getElementById("youtube-results");
  const karaokeCatalogEl = document.getElementById("karaoke-catalog");
  const catalogLoadStatus = document.getElementById("catalog-load-status");
  const CATALOG_CACHE_KEY = "ovp_catalog_browse_v1";
  let catalogBrowseCache = null;
  let catalogBrowsePromise = null;
  const queueList = document.getElementById("queue-list");
  const queueEmpty = document.getElementById("queue-empty");
  const tabBadgeUpnext = document.getElementById("tab-badge-upnext");
  const btnClearQueue = document.getElementById("btn-clear-queue");
  const settingsTabButtons = document.querySelectorAll(".settings-tab");
  const settingsTabPanels = {
    upnext: document.getElementById("panel-upnext"),
    songs: document.getElementById("panel-songs"),
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
  let playbackMode = "none"; // none | file | youtube
  let ytProgressTimer = null;
  let lastVolume = 85;
  /** @type {{ type: "youtube" | "file"; title: string; videoId?: string; file?: File }[]} */
  let playQueue = [];
  let suppressEndedAdvance = false;

  function emitLocalStateChange() {
    window.dispatchEvent(new CustomEvent("ovp:state"));
  }

  function getApiKey() {
    const fromStorage = localStorage.getItem(STORAGE_KEY) || "";
    const fromConfig = window.OVP_CONFIG?.youtubeApiKey || "";
    return fromStorage.trim() || fromConfig.trim();
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
    if (tabId === "songs") void loadAndRenderKaraokeCatalog();
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
      youtubeApiKeyInput.value = getApiKey();
      apiKeyStatus.textContent = getApiKey() ? "Key loaded." : "No key saved yet.";
      apiKeyStatus.className = "settings-status" + (getApiKey() ? " ok" : "");
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

  btnSaveApiKey.addEventListener("click", () => {
    const key = youtubeApiKeyInput.value.trim();
    if (key) {
      localStorage.setItem(STORAGE_KEY, key);
      apiKeyStatus.textContent = "API key saved in this browser.";
      apiKeyStatus.className = "settings-status ok";
    } else {
      localStorage.removeItem(STORAGE_KEY);
      apiKeyStatus.textContent = "API key cleared.";
      apiKeyStatus.className = "settings-status";
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
    if (playbackMode !== "file") {
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

  async function togglePlay() {
    if (playbackMode === "youtube") {
      const yt = getYoutubePlayer();
      if (!yt) return;
      const state = yt.getPlayerState();
      if (state === window.YT.PlayerState.PLAYING) yt.pauseVideo();
      else yt.playVideo();
      emitLocalStateChange();
      return;
    }
    if (!video.src && !video.currentSrc) return;
    if (video.paused) {
      try {
        await video.play();
      } catch {
        /* blocked */
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

  function fileTrack(file) {
    return {
      type: "file",
      file,
      title: file.name.replace(/\.[^.]+$/, ""),
    };
  }

  function isPlaybackActive() {
    if (playbackMode === "none" || !wrap.classList.contains("has-source")) return false;
    if (playbackMode === "file") return !video.ended;
    if (playbackMode === "youtube") {
      const yt = getYoutubePlayer();
      if (!yt || typeof yt.getPlayerState !== "function") return true;
      return yt.getPlayerState() !== window.YT.PlayerState.ENDED;
    }
    return false;
  }

  function renderQueue() {
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
      type.textContent = item.type === "youtube" ? "YouTube" : "File";
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

  async function playOrQueue(item) {
    if (isPlaybackActive()) {
      enqueueTrack(item);
      return;
    }
    await playItemNow(item);
  }

  async function playItemNow(item) {
    suppressEndedAdvance = true;
    try {
      if (item.type === "youtube") {
        await loadYoutubeVideo(item.videoId, item.title);
      } else if (item.file) {
        loadFile(item.file);
      }
    } finally {
      suppressEndedAdvance = false;
    }
  }

  async function playNextFromQueue() {
    if (suppressEndedAdvance || !playQueue.length) return;
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

  function renderBrowseItems(container, items, onPick) {
    if (!container) return;
    container.innerHTML = "";
    items.forEach((item) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "youtube-result-btn";
      const thumb = item.thumbnail || `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`;
      btn.innerHTML = `
        <img class="youtube-result-thumb" src="${thumb}" alt="" loading="lazy" />
        <div class="youtube-result-meta">
          <p class="youtube-result-title"></p>
          <p class="youtube-result-channel"></p>
        </div>
      `;
      btn.querySelector(".youtube-result-title").textContent = item.title;
      btn.querySelector(".youtube-result-channel").textContent = item.channel || "YouTube";
      btn.addEventListener("click", () => onPick(item));
      li.appendChild(btn);
      container.appendChild(li);
    });
  }

  async function buildCatalogBrowse(forceRefresh = false) {
    if (catalogBrowseCache && !forceRefresh) return catalogBrowseCache;
    if (catalogBrowsePromise && !forceRefresh) return catalogBrowsePromise;

    if (!forceRefresh) {
      try {
        const raw = sessionStorage.getItem(CATALOG_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length) {
            catalogBrowseCache = parsed;
            return parsed;
          }
        }
      } catch {
        /* ignore bad cache */
      }
    }

    catalogBrowsePromise = (async () => {
      const apiKey = getApiKey();
      const catalog = window.OVP_KARAOKE_CATALOG || [];
      const results = [];

      if (!apiKey) {
        catalogBrowsePromise = null;
        return results;
      }

      for (const entry of catalog) {
        try {
          if (entry.videoId) {
            results.push({
              id: entry.videoId,
              title: entry.title,
              catalogTitle: entry.title,
              channel: "Karaoke",
              thumbnail: `https://i.ytimg.com/vi/${entry.videoId}/mqdefault.jpg`,
            });
            continue;
          }
          const query = (entry.search || `${entry.title} karaoke`).trim();
          const items = await window.OVPYouTube.search(query, apiKey, 5);
          const pick =
            items.find((i) => /karaoke/i.test(i.title)) ||
            items.find((i) => new RegExp(entry.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(i.title)) ||
            items[0];
          if (pick) {
            results.push({
              id: pick.id,
              title: pick.title,
              catalogTitle: entry.title,
              channel: pick.channel,
              thumbnail: pick.thumbnail,
            });
          }
        } catch {
          /* skip failed entry */
        }
        await new Promise((r) => setTimeout(r, 100));
      }

      catalogBrowseCache = results;
      if (results.length) {
        try {
          sessionStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(results));
        } catch {
          /* storage full */
        }
      }
      catalogBrowsePromise = null;
      return results;
    })();

    return catalogBrowsePromise;
  }

  async function getCatalogBrowse(forceRefresh = false) {
    return buildCatalogBrowse(forceRefresh);
  }

  async function loadAndRenderKaraokeCatalog() {
    if (!karaokeCatalogEl) return;
    if (catalogLoadStatus) {
      catalogLoadStatus.textContent = "Loading karaoke library…";
      catalogLoadStatus.classList.remove("err");
    }

    const items = await buildCatalogBrowse(false);

    if (!items.length) {
      if (!getApiKey()) {
        if (catalogLoadStatus) {
          catalogLoadStatus.textContent = "Add YouTube API key in Config to load 50+ karaoke previews.";
          catalogLoadStatus.classList.add("err");
        }
        renderBrowseItems(karaokeCatalogEl, [], () => {});
        return;
      }
      if (catalogLoadStatus) {
        catalogLoadStatus.textContent = "Could not load library. Check API key and try again.";
        catalogLoadStatus.classList.add("err");
      }
      return;
    }

    if (catalogLoadStatus) {
      catalogLoadStatus.textContent = `${items.length} karaoke songs — tap to play or queue.`;
    }
    renderBrowseItems(karaokeCatalogEl, items, (item) => {
      hideYoutubeResults();
      void playOrQueue(youtubeTrack(item.id, item.title));
    });
  }

  async function pickFromCatalog(entry) {
    hideYoutubeResults();
    if (entry.videoId) {
      await playOrQueue(youtubeTrack(entry.videoId, entry.title));
      return;
    }

    const query = (entry.search || `${entry.title} karaoke`).trim();
    youtubeQuery.value = query;

    const directId = window.OVPYouTube.parseVideoId(query);
    if (directId) {
      await playOrQueue(youtubeTrack(directId, entry.title));
      return;
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      setYoutubeMessage("Add your YouTube API key in Config to load picks.", true);
      setSettingsOpen(true, { tab: "config" });
      return;
    }

    btnYoutubeSearch.disabled = true;
    setYoutubeMessage("Finding karaoke…");

    try {
      const items = await window.OVPYouTube.search(query, apiKey);
      if (items.length === 1) {
        hideYoutubeResults();
        setYoutubeMessage("");
        await playOrQueue(youtubeTrack(items[0].id, items[0].title));
      } else if (items.length > 0) {
        renderYoutubeResults(items.slice(0, 10));
        setYoutubeMessage("Pick a version below.");
      } else {
        hideYoutubeResults();
        setYoutubeMessage("No karaoke found. Try another search.", true);
      }
    } catch (err) {
      hideYoutubeResults();
      setYoutubeMessage(err.message || "Search failed.", true);
    } finally {
      btnYoutubeSearch.disabled = false;
    }
  }

  function renderYoutubeResults(items) {
    youtubeResults.innerHTML = "";
    if (!items.length) {
      hideYoutubeResults();
      setYoutubeMessage("No videos found. Try another search.", true);
      return;
    }
    youtubeResults.classList.remove("hidden");
    setYoutubeMessage("");

    items.forEach((item) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "youtube-result-btn";
      btn.innerHTML = `
        <img class="youtube-result-thumb" src="${item.thumbnail}" alt="" loading="lazy" />
        <div class="youtube-result-meta">
          <p class="youtube-result-title"></p>
          <p class="youtube-result-channel"></p>
        </div>
      `;
      btn.querySelector(".youtube-result-title").textContent = item.title;
      btn.querySelector(".youtube-result-channel").textContent = item.channel || "YouTube";
      btn.addEventListener("click", () => playOrQueue(youtubeTrack(item.id, item.title)));
      li.appendChild(btn);
      youtubeResults.appendChild(li);
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
    clearYoutubeSource();

    playbackMode = "youtube";
    wrap.classList.add("has-source", "mode-youtube");
    playerFrame.classList.add("youtube-active");
    youtubeHost.hidden = false;
    nowPlayingTitle.textContent = title || "YouTube video";

    try {
      await window.OVPYouTube.mountPlayer("youtube-player", videoId, {
        onReady: (e) => {
          const vol = Math.round(parseFloat(volumeInput.value) * 100);
          e.target.setVolume(vol);
          if (vol === 0) e.target.mute();
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
          if (playing) {
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
    playbackMode = "file";
    wrap.classList.remove("mode-youtube");

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

    const apiKey = getApiKey();
    const directId = window.OVPYouTube.parseVideoId(query);

    if (directId) {
      btnYoutubeSearch.disabled = true;
      setYoutubeMessage("Loading video…");
      try {
        const meta = await window.OVPYouTube.resolveDirectVideo(query, apiKey);
        await playOrQueue(youtubeTrack(meta.id, meta.title));
      } catch (err) {
        setYoutubeMessage(err.message || "Failed to load YouTube video.", true);
      } finally {
        btnYoutubeSearch.disabled = false;
      }
      return;
    }

    if (!apiKey) {
      setYoutubeMessage("Add your YouTube API key in Settings to search (links still work without a key).", true);
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
      const items = await window.OVPYouTube.search(query, apiKey);
      renderYoutubeResults(items);
      setYoutubeMessage("");
    } catch (err) {
      renderYoutubeResults([]);
      setYoutubeMessage(err.message || "Search failed.", true);
    } finally {
      btnYoutubeSearch.disabled = false;
    }
  });

  video.volume = parseFloat(volumeInput.value);

  btnPlay.addEventListener("click", togglePlay);
  btnCenterPlay.addEventListener("click", togglePlay);
  wrap.addEventListener("click", (e) => {
    if (playbackMode !== "youtube" && playbackMode !== "file") return;
    if (e.target.closest(".center-play, .ctrl-btn, button")) return;
    if (playbackMode === "file" && e.target === video) togglePlay();
    if (playbackMode === "youtube" && e.target.closest(".video-wrap")) togglePlay();
  });

  btnNext.addEventListener("click", () => {
    void skipToNext();
  });

  video.addEventListener("play", () => {
    if (playbackMode === "file") setPlayingUI(true);
  });
  video.addEventListener("pause", () => {
    if (playbackMode === "file") setPlayingUI(false);
  });
  video.addEventListener("timeupdate", () => {
    if (playbackMode === "file") updateProgress();
  });
  video.addEventListener("loadedmetadata", updateProgress);
  video.addEventListener("progress", updateBuffer);
  video.addEventListener("ended", () => {
    if (playbackMode !== "file") return;
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
    if (playbackMode === "file") return !video.paused && !video.ended;
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
    } else if (playbackMode === "file") {
      video.pause();
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
    const apiKey = getApiKey();
    const directId = window.OVPYouTube.parseVideoId(q);
    if (directId) {
      const meta = await window.OVPYouTube.resolveDirectVideo(q, apiKey);
      return [
        {
          id: meta.id,
          title: meta.title,
          channel: meta.channel,
          thumbnail: meta.thumbnail,
        },
      ];
    }
    if (!apiKey) throw new Error("Host needs a YouTube API key in Config.");
    return window.OVPYouTube.search(q, apiKey);
  }

  function getPublicState() {
    return {
      nowPlaying: nowPlayingTitle.textContent,
      playbackMode,
      isPlaying: getIsPlaying(),
      volume: parseFloat(volumeInput.value),
      queue: playQueue.map((item) => ({
        type: item.type,
        title: item.title,
        videoId: item.videoId,
      })),
    };
  }

  btnFullscreen.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else playerFrame.requestFullscreen?.();
  });

  document.addEventListener("fullscreenchange", () => {
    scheduleLayoutRefresh();
  });

  wrap.addEventListener("mouseleave", () => wrap.classList.remove("show-center-play"));
  video.addEventListener("pause", () => {
    if (playbackMode === "file") wrap.classList.add("show-center-play");
  });
  video.addEventListener("play", () => {
    if (playbackMode === "file") wrap.classList.remove("show-center-play");
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
    clearQueue,
    removeQueueAt,
    searchYoutube,
    getCatalogBrowse,
    getState: getPublicState,
  };

  video.addEventListener("play", emitLocalStateChange);
  video.addEventListener("pause", emitLocalStateChange);

  window.OVPYouTube.loadIframeApi().catch(() => {});
  emitLocalStateChange();
})();
