window.OVPYouTube = (function () {
  const IFRAME_API = "https://www.youtube.com/iframe_api";
  let apiReadyPromise = null;
  let player = null;
  let pendingVideoId = null;

  function loadIframeApi() {
    if (window.YT && window.YT.Player) {
      return Promise.resolve(window.YT);
    }
    if (apiReadyPromise) return apiReadyPromise;

    apiReadyPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prev === "function") prev();
        resolve(window.YT);
      };

      if (!document.querySelector(`script[src="${IFRAME_API}"]`)) {
        const tag = document.createElement("script");
        tag.src = IFRAME_API;
        document.head.appendChild(tag);
      }
    });

    return apiReadyPromise;
  }

  function parseVideoId(input) {
    const raw = (input || "").trim();
    if (!raw) return null;
    if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;

    try {
      const url = raw.startsWith("http") ? new URL(raw) : new URL(`https://${raw}`);
      const host = url.hostname.replace(/^www\./, "");

      if (host === "youtu.be") {
        const id = url.pathname.slice(1).split("/")[0];
        return id.length === 11 ? id : null;
      }

      if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
        const v = url.searchParams.get("v");
        if (v && v.length === 11) return v;
        const embed = url.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
        if (embed) return embed[1];
        const shorts = url.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
        if (shorts) return shorts[1];
      }
    } catch {
      return null;
    }
    return null;
  }

  async function fetchVideoSnippet(videoId, apiKey) {
    const params = new URLSearchParams({
      part: "snippet",
      id: videoId,
      key: apiKey,
    });
    const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
    const data = await res.json();
    if (!res.ok) return null;
    const item = data.items?.[0];
    if (!item) return null;
    return {
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    };
  }

  async function resolveDirectVideo(query, apiKey) {
    const videoId = parseVideoId(query);
    if (!videoId) return null;

    const fallback = {
      id: videoId,
      title: "YouTube video",
      channel: "",
      thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    };

    if (!apiKey) return fallback;

    const snippet = await fetchVideoSnippet(videoId, apiKey);
    if (!snippet) return fallback;

    return {
      id: videoId,
      title: snippet.title,
      channel: snippet.channel,
      thumbnail: snippet.thumbnail,
    };
  }

  async function search(query, apiKey, maxResults = 12) {
    const q = (query || "").trim();
    if (!q) throw new Error("Enter a search term or YouTube link.");
    if (!apiKey) throw new Error("Add your YouTube API key in Settings to search.");

    const direct = await resolveDirectVideo(q, apiKey);
    if (direct) return [direct];

    const params = new URLSearchParams({
      part: "snippet",
      type: "video",
      maxResults: String(maxResults),
      q,
      key: apiKey,
      safeSearch: "none",
    });

    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    const data = await res.json();

    if (!res.ok) {
      const msg = data?.error?.message || `YouTube API error (${res.status})`;
      throw new Error(msg);
    }

    return (data.items || [])
      .filter((item) => item.id?.videoId)
      .map((item) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || "",
      }));
  }

  function getEmbedOrigin() {
    if (location.protocol !== "http:" && location.protocol !== "https:") return null;
    const origin = window.location.origin;
    if (!origin || origin === "null") return null;
    return origin;
  }

  function canEmbed() {
    return getEmbedOrigin() !== null;
  }

  function applyIframeReferrerPolicy(elementId) {
    const iframe = document.getElementById(elementId)?.querySelector("iframe");
    if (iframe) {
      iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    }
  }

  function destroyPlayer() {
    if (player) {
      try {
        player.destroy();
      } catch {
        /* already torn down */
      }
      player = null;
    }
    pendingVideoId = null;
  }

  function mountPlayer(elementId, videoId, { onReady, onStateChange, onError } = {}) {
    const origin = getEmbedOrigin();
    if (!origin) {
      return Promise.reject(
        new Error(
          "YouTube needs http://localhost (not file://). Double-click start-server.bat in this folder, then open the localhost link."
        )
      );
    }

    pendingVideoId = videoId;
    return loadIframeApi().then(
      () =>
        new Promise((resolve, reject) => {
          destroyPlayer();

          player = new window.YT.Player(elementId, {
            videoId,
            width: "100%",
            height: "100%",
            playerVars: {
              autoplay: 1,
              controls: 0,
              disablekb: 1,
              enablejsapi: 1,
              fs: 0,
              iv_load_policy: 3,
              cc_load_policy: 0,
              modestbranding: 1,
              origin,
              rel: 0,
              loop: 0,
              playsinline: 1,
            },
            events: {
              onReady: (e) => {
                applyIframeReferrerPolicy(elementId);
                if (typeof onReady === "function") onReady(e);
                resolve(e.target);
              },
              onStateChange: (e) => {
                if (typeof onStateChange === "function") onStateChange(e);
              },
              onError: (e) => {
                if (typeof onError === "function") onError(e);
                reject(new Error("This video cannot be played (restricted or unavailable)."));
              },
            },
          });
        })
    );
  }

  function getPlayer() {
    return player;
  }

  return {
    parseVideoId,
    resolveDirectVideo,
    search,
    mountPlayer,
    destroyPlayer,
    getPlayer,
    loadIframeApi,
    canEmbed,
    getEmbedOrigin,
  };
})();
