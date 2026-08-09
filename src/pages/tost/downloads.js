const TOST_RELEASE_API =
  "https://api.github.com/repos/sadabx/TOST/releases/latest";
const TOST_RELEASE_PAGE = "https://github.com/sadabx/TOST/releases/latest";
const TOST_ASSET_PREFIX =
  "https://github.com/sadabx/TOST/releases/download/";

const assetPatterns = {
  appimage: /^TOST-[\w.-]+-x86_64\.AppImage$/i,
  "linux-portable": /^TOST-[\w.-]+-linux-x64\.tar\.gz$/i,
  arch: /^tost-[\w.-]+-1-x86_64\.pkg\.tar\.zst$/i,
};

function detectPlatform() {
  const userAgent = navigator.userAgent.toLowerCase();
  const isArm = /arm|aarch64/.test(userAgent);

  if (isArm) return "unsupported";
  if (userAgent.includes("windows")) return "windows";
  if (userAgent.includes("linux") && !userAgent.includes("android")) {
    return "linux";
  }
  return "unsupported";
}

function markDetectedPlatform(platform) {
  document.querySelectorAll("[data-platform-card]").forEach((card) => {
    const detected = card.dataset.platformCard === platform;
    card.classList.toggle("is-detected", detected);
    const badge = card.querySelector("[data-platform-badge]");
    if (badge) badge.hidden = !detected;
  });
}

function setRecommendation(platform, linuxAppImage) {
  const copy = document.querySelector("[data-recommendation-copy]");
  const link = document.querySelector("[data-recommended-download]");
  const label = document.querySelector("[data-recommended-label]");
  if (!copy || !link || !label) return;
  markDetectedPlatform(platform);

  if (platform === "windows") {
    copy.textContent = "Recommended for this Windows device";
    label.textContent = "Windows x64 Setup";
    link.href =
      "https://github.com/sadabx/TOST/releases/latest/download/TOST-win-Setup.exe";
    return;
  }

  if (platform === "linux") {
    copy.textContent = "Recommended for this Linux device";
    label.textContent = "Linux x64 AppImage";
    link.href = linuxAppImage || TOST_RELEASE_PAGE;
    return;
  }

  copy.textContent =
    "TOST currently provides native x64 builds for Windows and Linux:";
  label.textContent = "View available downloads";
  link.href = TOST_RELEASE_PAGE;
}

function trustedAssetUrl(asset) {
  return typeof asset?.browser_download_url === "string" &&
    asset.browser_download_url.startsWith(TOST_ASSET_PREFIX)
    ? asset.browser_download_url
    : null;
}

async function loadRelease() {
  const platform = detectPlatform();
  setRecommendation(platform, null);

  const status = document.querySelector("[data-release-status]");
  const releaseLink = document.querySelector("[data-release-link]");

  try {
    const response = await fetch(TOST_RELEASE_API, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);

    const release = await response.json();
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const resolved = {};

    Object.entries(assetPatterns).forEach(([key, pattern]) => {
      const asset = assets.find((candidate) => pattern.test(candidate.name));
      const url = trustedAssetUrl(asset);
      const link = document.querySelector(`[data-release-asset="${key}"]`);
      if (url && link) {
        link.href = url;
        resolved[key] = url;
      }
    });

    const releaseUrl =
      typeof release.html_url === "string" &&
        release.html_url.startsWith("https://github.com/sadabx/TOST/releases/")
        ? release.html_url
        : TOST_RELEASE_PAGE;
    const version =
      typeof release.tag_name === "string" ? release.tag_name : "Latest release";

    if (releaseLink) {
      releaseLink.href = releaseUrl;
      releaseLink.textContent = version;
    }
    if (status) status.textContent = "Downloads verified from GitHub";
    setRecommendation(platform, resolved.appimage || null);
  } catch (error) {
    console.warn("Unable to load the latest TOST release:", error);
    if (status) {
      status.textContent = "Live release details unavailable - open GitHub Releases";
    }
  }
}

document.addEventListener("DOMContentLoaded", loadRelease);
