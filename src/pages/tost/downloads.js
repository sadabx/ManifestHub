const TOST_RELEASE_API =
  "https://api.github.com/repos/sadabx/TOST/releases/latest";
const TOST_RELEASE_PAGE = "https://github.com/sadabx/TOST/releases/latest";
const WORKER_URL = "https://manifesthub-bridge.trionine.workers.dev/";

// Debounce: ignore repeated tracking signals for the same asset within 30s
const TRACK_DEBOUNCE_MS = 30_000;

// Extended patterns to dynamically handle Windows assets as well
const assetPatterns = {
  "win-setup": /^TOST-.*win.*-Setup\.exe$/i,
  "win-portable": /^TOST-.*win.*-Portable\.zip$/i,
  appimage: /^TOST-[\w.-]+-x86_64\.AppImage$/i,
  "linux-portable": /^TOST-[\w.-]+-linux-x64\.tar\.gz$/i,
  arch: /^tost-[\w.-]+-1-x86_64\.pkg\.tar\.zst$/i,
  deb: /^tost_[\w.-]+_amd64\.deb$/i,
};

// ---- Download Tracking ----

function trackTostDownload(assetType, assetName) {
  const now = Date.now();
  const debounceMap = JSON.parse(
    sessionStorage.getItem("_tost_dm") || "{}",
  );

  if (debounceMap[assetType] && now - debounceMap[assetType] < TRACK_DEBOUNCE_MS) return;

  debounceMap[assetType] = now;
  sessionStorage.setItem("_tost_dm", JSON.stringify(debounceMap));

  const params = new URLSearchParams({
    tost_download: assetType,
    asset_name: assetName || assetType,
  });

  fetch(`${WORKER_URL}?${params}`, { method: "GET", mode: "cors" }).catch(
    (err) => console.error("TOST tracking error:", err),
  );
}

// ---- Platform Detection ----

async function detectPlatform() {
  // Use Client Hints API if supported, fall back to User Agent string
  if (navigator.userAgentData) {
    try {
      const hints = await navigator.userAgentData.getHighEntropyValues([
        "architecture",
      ]);
      if (hints.architecture === "arm") return "unsupported";
      const platform = navigator.userAgentData.platform.toLowerCase();
      if (platform.includes("win")) return "windows";
      if (platform.includes("linux")) return "linux";
    } catch {
      /* fallback to User Agent */
    }
  }

  const ua = navigator.userAgent.toLowerCase();
  if (/arm|aarch64/.test(ua)) return "unsupported";
  if (ua.includes("windows")) return "windows";
  if (ua.includes("linux") && !ua.includes("android")) return "linux";

  return "unsupported";
}

function verifyAssetUrl(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "github.com" &&
      parsed.pathname.startsWith("/sadabx/TOST/releases/download/")
    );
  } catch {
    return false;
  }
}

function updateRecommendation(platform, resolvedAssets) {
  const copy = document.querySelector("[data-recommendation-copy]");
  const link = document.querySelector("[data-recommended-download]");
  const label = document.querySelector("[data-recommended-label]");

  if (!copy || !link || !label) return;

  // Highlight platform card
  document.querySelectorAll("[data-platform-card]").forEach((card) => {
    const isDetected = card.dataset.platformCard === platform;
    card.classList.toggle("is-detected", isDetected);
    const badge = card.querySelector("[data-platform-badge]");
    if (badge) badge.hidden = !isDetected;
  });

  if (platform === "windows") {
    copy.textContent = "Recommended for your Windows device:";
    label.textContent = "Download Windows Setup";
    link.href = resolvedAssets["win-setup"] || TOST_RELEASE_PAGE;
    return;
  }

  if (platform === "linux") {
    copy.textContent = "Recommended for your Linux device:";
    label.textContent = "Download Linux AppImage";
    link.href = resolvedAssets.appimage || TOST_RELEASE_PAGE;
    return;
  }

  copy.textContent = "TOST provides native x64 builds for Windows and Linux:";
  label.textContent = "View Available Downloads";
  link.href = TOST_RELEASE_PAGE;
}

// ---- Click Tracking Attachment ----

function attachDownloadTracking() {
  // Track individual asset download links
  document.querySelectorAll("[data-release-asset]").forEach((link) => {
    link.addEventListener("click", () => {
      const assetType = link.dataset.releaseAsset;
      const fileName = link.href.split("/").pop() || assetType;
      trackTostDownload(assetType, fileName);
      showDownloadToast(toastMessages[assetType] || "Downloading TOST…");
    });
  });

  // Track the recommended download button
  const recommendedBtn = document.querySelector("[data-recommended-download]");
  if (recommendedBtn) {
    recommendedBtn.addEventListener("click", () => {
      // Determine which asset the recommended button points to
      const href = recommendedBtn.href || "";
      let assetType = "recommended";
      for (const [key, pattern] of Object.entries(assetPatterns)) {
        const fileName = href.split("/").pop() || "";
        if (pattern.test(fileName)) {
          assetType = key;
          break;
        }
      }
      const fileName = href.split("/").pop() || "TOST";
      trackTostDownload(assetType, fileName);
      showDownloadToast(toastMessages[assetType] || "Downloading TOST…");
    });
  }
}

// ---- Release Loader ----

async function loadRelease() {
  const platform = await detectPlatform();
  const status = document.querySelector("[data-release-status]");
  const releaseLink = document.querySelector("[data-release-link]");

  try {
    const response = await fetch(TOST_RELEASE_API, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const release = await response.json();
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const resolved = {};

    Object.entries(assetPatterns).forEach(([key, pattern]) => {
      const asset = assets.find((candidate) => pattern.test(candidate.name));
      if (
        asset?.browser_download_url &&
        verifyAssetUrl(asset.browser_download_url)
      ) {
        resolved[key] = asset.browser_download_url;
        const link = document.querySelector(`[data-release-asset="${key}"]`);
        if (link) link.href = asset.browser_download_url;
      }
    });

    if (releaseLink && release.html_url) {
      releaseLink.href = release.html_url;
      releaseLink.textContent = release.tag_name || "Latest release";
    }

    if (status) status.textContent = "Downloads verified from GitHub";
    updateRecommendation(platform, resolved);
  } catch (error) {
    console.warn("Release fetch failed:", error);
    if (status)
      status.textContent = "Live details unavailable — visit GitHub Releases";
    updateRecommendation(platform, {});
  }

  // Attach tracking after links have been resolved
  attachDownloadTracking();
}

document.addEventListener("DOMContentLoaded", loadRelease);
