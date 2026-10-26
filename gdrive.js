window.OVPDrive = (function () {
  function parseFileId(input) {
    const raw = (input || "").trim();
    if (!raw) return null;
    if (/^https?:/i.test(raw) === false && /^[a-zA-Z0-9_-]{25,}$/.test(raw) && !raw.includes("/")) {
      return raw;
    }
    try {
      const url = raw.startsWith("http") ? new URL(raw) : new URL(`https://${raw}`);
      const host = url.hostname.replace(/^www\./, "");
      if (!host.endsWith("google.com") && host !== "drive.google.com") return null;
      const filePath = url.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (filePath) return filePath[1];
      const id = url.searchParams.get("id");
      if (id && /\/folders\//.test(url.pathname) === false) return id;
    } catch {
      return null;
    }
    return null;
  }

  function parseFolderId(input) {
    const raw = (input || "").trim();
    if (!raw) return null;
    try {
      const url = raw.startsWith("http") ? new URL(raw) : new URL(`https://${raw}`);
      const host = url.hostname.replace(/^www\./, "");
      if (!host.endsWith("google.com")) return null;
      const folderPath = url.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
      if (folderPath) return folderPath[1];
    } catch {
      return null;
    }
    return null;
  }

  function mediaUrl(fileId, apiKey) {
    const params = new URLSearchParams({
      alt: "media",
      key: apiKey,
      supportsAllDrives: "true",
    });
    return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params}`;
  }

  function directUrl(fileId) {
    return `https://drive.google.com/uc?export=download&confirm=t&id=${encodeURIComponent(fileId)}`;
  }

  function localStreamUrl(fileId, apiKey) {
    return `/ovp-drive/${encodeURIComponent(fileId)}?key=${encodeURIComponent(apiKey)}`;
  }

  function streamUrls(fileId, apiKey) {
    const urls = [];
    if (apiKey) {
      urls.push(localStreamUrl(fileId, apiKey));
      urls.push(mediaUrl(fileId, apiKey));
    }
    urls.push(`https://lh3.googleusercontent.com/d/${encodeURIComponent(fileId)}`);
    urls.push(directUrl(fileId));
    return urls;
  }

  function embedUrl(fileId) {
    return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
  }

  function thumbnailUrl(fileId) {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w320`;
  }

  function friendlyApiError(data, status) {
    const message = data?.error?.message || `Google Drive error (${status})`;
    const err = new Error(message);
    err.status = status;
    const reasons = (data?.error?.errors || []).map((e) => e.reason).filter(Boolean);
    err.quota = status === 403 && reasons.some((r) => /quota|limitExceeded|rateLimit/i.test(r));
    if (/Drive API has not been used|it is disabled|accessNotConfigured/i.test(message)) {
      err.message =
        "Enable Google Drive API in Google Cloud (APIs & Services → Library), then use the same API key.";
    } else if (status === 404) {
      err.message = "Drive file or folder not found. Check the link and sharing settings.";
    } else if (status === 403 && !err.quota) {
      err.message =
        "Drive sharing is too private. On Google Drive, set the file/folder to Anyone with the link (Viewer).";
    }
    return err;
  }

  async function getFileMeta(fileId, apiKey) {
    const params = new URLSearchParams({
      fields: "id,name,mimeType,videoMediaMetadata(durationMillis)",
      key: apiKey,
      supportsAllDrives: "true",
    });
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw friendlyApiError(data, res.status);
    return data;
  }

  function toLibraryItem(file) {
    const id = file.shortcutDetails?.targetId || file.id;
    return {
      id,
      title: (file.name || "Drive video").replace(/\.[^.]+$/, ""),
      channel: "Google Drive",
      source: "gdrive",
      thumbnail: thumbnailUrl(id),
    };
  }

  function isVideoFile(file) {
    const mime = file.mimeType || "";
    const target = file.shortcutDetails?.targetMimeType || "";
    const name = `${file.name || ""}`.toLowerCase();
    return (
      mime.startsWith("video/") ||
      target.startsWith("video/") ||
      /\.(mp4|m4v|webm|mkv|mov|avi|mpeg|mpg)$/.test(name)
    );
  }

  async function listFolderVideos(folderId, apiKey) {
    const items = [];
    let pageToken = "";
    do {
      const params = new URLSearchParams({
        q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
        fields: "nextPageToken,files(id,name,mimeType,shortcutDetails(targetId,targetMimeType))",
        pageSize: "100",
        orderBy: "name",
        key: apiKey,
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw friendlyApiError(data, res.status);
      (data.files || []).filter(isVideoFile).forEach((file) => items.push(toLibraryItem(file)));
      pageToken = data.nextPageToken || "";
    } while (pageToken && items.length < 500);
    return items;
  }

  return {
    parseFileId,
    parseFolderId,
    mediaUrl,
    directUrl,
    streamUrls,
    embedUrl,
    thumbnailUrl,
    getFileMeta,
    listFolderVideos,
  };
})();
