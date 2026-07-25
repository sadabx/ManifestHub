// =============================================================
// search.js — Search Engine, Game Panel & Downloads
// =============================================================
// Handles database search input, search engine switching,
// game file display, individual/ZIP downloads, download tracking,
// and legacy archive checking.
// =============================================================

const WORKER_URL = "https://manifesthub-bridge.trionine.workers.dev/";
const REPO_OWNER = "SSMGAlt";

// Debounce window: ignore repeated download signals for the same item within 30 seconds.
// Prevents double-counting when a user clicks a download button multiple times rapidly.
const TRACK_DEBOUNCE_MS = 30_000;

/**
 * Sends a download tracking event to the analytics worker.
 * @param {string|number} appId
 * @param {string} name
 */
async function trackEvent(appId, name) {
  const now = Date.now();
  const key = `${appId}:${name}`;

  // Dynamically pull the freshest map state right when the event fires
  const activeDebounceMap = JSON.parse(sessionStorage.getItem("_dm") || "{}");

  const last = activeDebounceMap[key];
  if (last && now - last < TRACK_DEBOUNCE_MS) return;

  activeDebounceMap[key] = now;
  sessionStorage.setItem("_dm", JSON.stringify(activeDebounceMap));

  const sessionUserId = window.MH.currentUser?.id || "";
  fetch(
    `${WORKER_URL}?download=${appId}&name=${encodeURIComponent(name)}&uid=${sessionUserId}`,
    { method: "GET", mode: "no-cors" },
  ).catch((err) => console.error("Worker signal error:", err));
}

// ---- LUA Generation ----

function generateLuaContent(appId, depots) {
  const depotKeys = window.MH.depotKeys;
  const lua = [`addappid(${appId})`];
  let validCount = 0;
  for (const depot of depots) {
    const key = depotKeys[depot.toString()];
    if (key) {
      lua.push(`addappid(${depot},0,"${key}")`);
      validCount++;
    }
  }
  return { content: lua.join("\n"), count: validCount };
}

// ---- Live Manifest Fetching ----

async function fetchLiveManifests(appId) {
  try {
    // Source: api.steamcmd.net
    // Purpose: Queries dynamically to find the latest live manifestId for the game's depots.
    const response = await fetch(`https://api.steamcmd.net/v1/info/${appId}`);
    const data = await response.json();
    if (data.status === "success" && data.data[appId]) {
      const depots = data.data[appId].depots;
      const candidates = [];
      for (const depotId in depots) {
        if (
          !isNaN(depotId) &&
          depots[depotId].manifests &&
          depots[depotId].manifests.public
        ) {
          const manifestId = depots[depotId].manifests.public.gid;
          const depotName = depots[depotId].name || `Depot ${depotId}`;
          candidates.push({
            depotId,
            manifestId,
            depotName,
            // Source: qwe213312/k25FCdfEOoEJ42S6
            // Purpose: Direct download URL for the actual live .manifest file.
            downloadUrl: `https://raw.githubusercontent.com/qwe213312/k25FCdfEOoEJ42S6/main/${depotId}_${manifestId}.manifest`,
          });
        }
      }

      const availability = await Promise.all(
        candidates.map(async (manifest) => {
          try {
            const response = await fetch(manifest.downloadUrl, {
              method: "HEAD",
            });
            return response.ok ? manifest : null;
          } catch (error) {
            return null;
          }
        }),
      );
      const manifests = availability.filter(Boolean);
      return {
        manifests,
        unavailableCount: candidates.length - manifests.length,
      };
    }
  } catch (e) { }
  return { manifests: [], unavailableCount: 0 };
}

// ---- Denuvo Check ----

function checkDenuvoStatus(appId) {
  return window.MH.denuvoAppIds.has(Number(appId));
}

// ---- Game File Display ----

let currentSelectedGame = null;
let currentFiles = [];

/**
 * Displays the file panel for a selected game (lua, manifests, legacy zip).
 * Exposed globally so trending.js can call it.
 * @param {number} appId
 * @param {string} gameName
 */
window.MH_displayGameFiles = async function (appId, gameName) {
  currentSelectedGame = { appId, gameName };

  // Reset Denuvo warning and badge
  const denuvoBadge = document.getElementById("denuvoBadge");
  const denuvoWarning = document.getElementById("denuvoWarning");
  if (denuvoBadge) denuvoBadge.classList.add("hidden");
  if (denuvoWarning) denuvoWarning.classList.add("hidden");

  // Check Denuvo status
  const hasDenuvo = checkDenuvoStatus(appId);
  if (currentSelectedGame && currentSelectedGame.appId === appId && hasDenuvo) {
    if (denuvoBadge) denuvoBadge.classList.remove("hidden");
    if (denuvoWarning) denuvoWarning.classList.remove("hidden");
  }

  const gameIcon = document.getElementById("selectedGameIcon");
  gameIcon.style.display = "";
  gameIcon.src = `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
  gameIcon.alt = gameName;
  gameIcon.onerror = () => {
    gameIcon.style.display = "none";
  };
  document.getElementById("selectedGameName").textContent = gameName;
  document.getElementById("selectedGameId").textContent = `AppID: ${appId}`;

  const filesList = document.getElementById("availableFilesList");
  filesList.innerHTML =
    '<div class="text-center py-4 text-github-muted"><i class="fas fa-spinner fa-spin"></i> Loading files...</div>';
  document.getElementById("selectedGamePanel").classList.remove("hidden");

  const files = [];
  const depots = window.MH.appDepots[appId] || [];

  if (depots.length > 0) {
    const luaResult = generateLuaContent(appId, depots);
    if (luaResult.count > 0) {
      const luaBlob = new Blob([luaResult.content], { type: "text/plain" });
      const luaUrl = URL.createObjectURL(luaBlob);
      files.push({
        name: `${appId}.lua`,
        type: "Lua Keys",
        size: `${luaResult.content.length} bytes`,
        icon: "fas fa-file-code",
        iconColor: "text-green-400",
        url: luaUrl,
        blob: luaBlob,
      });
    }
  }

  const { manifests: liveManifests, unavailableCount } =
    await fetchLiveManifests(appId);
  for (const manifest of liveManifests) {
    files.push({
      name: `${manifest.depotId}_${manifest.manifestId}.manifest`,
      type: "Manifest file",
      icon: "fas fa-file-invoice",
      iconColor: "text-blue-400",
      url: manifest.downloadUrl,
      isExternal: true,
    });
  }

  try {
    // Source: SSMGAlt/ManifestHub2 (Legacy Archive)
    // Purpose: Checks if a legacy branch named by AppID exists.
    const githubCheck = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/ManifestHub2/branches/${appId}`,
    );
    if (githubCheck.status === 200) {
      files.push({
        name: `${appId}.zip`,
        type: "Legacy Zip",
        icon: "fas fa-file-zipper",
        iconColor: "text-purple-400",
        // Source: SSMGAlt/ManifestHub2 (Legacy Archive)
        // Purpose: Direct URL to download the branch as a ZIP file.
        url: `https://codeload.github.com/${REPO_OWNER}/ManifestHub2/zip/refs/heads/${appId}`,
        isExternal: true,
      });
    }
  } catch (e) { }

  if (files.length === 0) {
    filesList.innerHTML = unavailableCount
      ? '<div class="text-center py-4 text-github-muted"><strong>No verified downloads are available on ManifestHub for this game yet.</strong><br>The current Steam manifest is known, but our sources do not have the matching manifest file and depot key needed to create a working package. Please check again after the database updates.</div>'
      : '<div class="text-center py-4 text-github-muted">No files available for this game yet.</div>';
    document.getElementById("downloadAllZipBtn").classList.add("hidden");
    currentFiles = [];
    return;
  }

  filesList.innerHTML = "";
  files.forEach((file) => {
    const fileDiv = document.createElement("div");
    fileDiv.className = "file-item";
    fileDiv.innerHTML = `
      <div class="file-info">
        <i class="${file.icon} ${file.iconColor} file-icon"></i>
        <div class="file-details">
          <span class="file-name">${window.escapeHtml(file.name)}</span>
          <span class="file-meta">${file.type}${file.size ? ` · ${file.size}` : ""}</span>
        </div>
      </div>
      <button class="download-btn"><i class="fas fa-download mr-1"></i> Download</button>
    `;
    fileDiv.querySelector(".download-btn").addEventListener("click", () => {
      trackEvent(appId, `${gameName} - ${file.type}`);
      const a = document.createElement("a");
      a.href = file.url;
      a.download = file.name;
      if (file.isExternal) a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
    filesList.appendChild(fileDiv);
  });

  if (unavailableCount) {
    const notice = document.createElement("div");
    notice.className = "text-center py-4 text-github-muted";
    notice.textContent = `${unavailableCount} current manifest file${unavailableCount === 1 ? " is" : "s are"} not yet available on ManifestHub. Only the verified files shown above will be downloaded.`;
    filesList.appendChild(notice);
  }

  document.getElementById("downloadAllZipBtn").classList.remove("hidden");
  currentFiles = files;
};

// ---- ZIP Download ----

function initZipDownload() {
  document
    .getElementById("downloadAllZipBtn")
    .addEventListener("click", async () => {
      if (currentFiles && currentFiles.length > 0 && currentSelectedGame) {
        trackEvent(
          currentSelectedGame.appId,
          currentSelectedGame.gameName + " (ZIP)",
        );
        if (typeof JSZip === "undefined") {
          alert("Loading ZIP library, please try again...");
          return;
        }
        const zipBtn = document.getElementById("downloadAllZipBtn");
        zipBtn.disabled = true;
        zipBtn.innerHTML =
          '<i class="fas fa-spinner fa-spin mr-2"></i> Zipping...';

        const zip = new JSZip();
        const failedFiles = [];
        for (const file of currentFiles) {
          if (file.blob) {
            const content = await file.blob.text();
            zip.file(file.name, content);
          } else if (file.url) {
            try {
              const response = await fetch(file.url);
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
              }
              const blob = await response.blob();
              zip.file(file.name, blob);
            } catch (e) {
              failedFiles.push(file.name);
            }
          }
        }

        if (Object.keys(zip.files).length === 0) {
          zipBtn.disabled = false;
          zipBtn.innerHTML =
            '<i class="fas fa-file-archive mr-2"></i> Download All';
          alert("No files could be downloaded. Please try again later.");
          return;
        }

        const content = await zip.generateAsync({ type: "blob" });
        const downloadUrl = URL.createObjectURL(content);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = `${currentSelectedGame.gameName.replace(/[^a-z0-9]/gi, "_")}_T9.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);

        if (failedFiles.length) {
          alert(
            `Downloaded the available files. Skipped ${failedFiles.length} file${failedFiles.length === 1 ? "" : "s"} that could not be fetched.`,
          );
        }

        zipBtn.innerHTML = '<i class="fas fa-check mr-2"></i> Complete!';
        setTimeout(() => {
          zipBtn.disabled = false;
          zipBtn.innerHTML =
            '<i class="fas fa-file-archive mr-2"></i> Download All';
        }, 2000);
      }
    });
}

// ---- Legacy Archive Check ----

function initLegacyCheck() {
  const legacyCheckBtn = document.getElementById("legacyCheckBtn");
  const legacyTerminalOutput = document.getElementById("legacyTerminalOutput");
  const mainSearchInput = document.getElementById("mainSearchInput");
  const legacyResultsSection = document.getElementById("legacyResultsSection");

  async function typeLegacyText(text) {
    for (let i = 0; i < text.length; i++) {
      legacyTerminalOutput.textContent += text.charAt(i);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  async function legacyCheckManifest() {
    const gameId = mainSearchInput.value.trim();
    if (!gameId || !/^\d+$/.test(gameId)) {
      alert("Please enter a valid Steam AppID (numbers only)");
      return;
    }

    legacyCheckBtn.disabled = true;
    legacyCheckBtn.innerHTML =
      '<i class="fas fa-spinner fa-spin mr-2"></i> Checking';
    legacyResultsSection.classList.remove("hidden");
    document.getElementById("legacyDownloadSection").classList.add("hidden");
    document.getElementById("legacyNotFoundSection").classList.add("hidden");
    legacyTerminalOutput.textContent = "";

    await typeLegacyText(
      `> Initiating manifest check for Steam AppID: ${gameId}\n`,
    );
    await typeLegacyText(`> Searching GitHub repository...\n`);

    try {
      // Source: SSMGAlt/ManifestHub2 (Legacy Archive)
      // Purpose: Checks if the branch exists for the requested Legacy AppID.
      const response = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/ManifestHub2/branches/${gameId}`,
      );
      if (response.status === 200) {
        await typeLegacyText(`> ✅ Manifest found in database!\n`);
        const gameName = window.MH.appNames[parseInt(gameId)] || "Unknown Game";
        // Source: SSMGAlt/ManifestHub2 (Legacy Archive)
        // Purpose: URL to download the specific legacy archive zip.
        const githubUrl = `https://codeload.github.com/${REPO_OWNER}/ManifestHub2/zip/refs/heads/${gameId}`;

        const dl = document.getElementById("legacyDownloadLink");
        dl.href = githubUrl;
        dl.target = "_blank";

        // Add one-time click listener for tracking
        dl.onclick = () => {
          trackEvent(gameId, gameName + " (Legacy)");
        };

        document
          .getElementById("legacyDownloadSection")
          .classList.remove("hidden");
        legacyCheckBtn.innerHTML = '<i class="fas fa-check mr-2"></i> Check';
      } else {
        await typeLegacyText(`> ❌ Manifest not found in GitHub archive.\n`);
        document
          .getElementById("legacyNotFoundSection")
          .classList.remove("hidden");
        legacyCheckBtn.innerHTML = "Check Again";
      }
    } catch (error) {
      await typeLegacyText(`> ⚠️ Error checking manifest.\n`);
      legacyCheckBtn.innerHTML = "Check Again";
    }
    legacyCheckBtn.disabled = false;
  }
  legacyCheckBtn.addEventListener("click", legacyCheckManifest);
}

// ---- Search Engine Switcher ----

/**
 * Initializes the search engine, game panel, ZIP download, and legacy check.
 */
window.MH_initSearch = function () {
  const searchEngineSelect = document.getElementById("searchEngineSelect");
  const mainSearchInput = document.getElementById("mainSearchInput");
  const legacyCheckBtn = document.getElementById("legacyCheckBtn");
  const searchResultsDiv = document.getElementById("searchResults");
  const legacyResultsSection = document.getElementById("legacyResultsSection");
  const searchIcon = document.getElementById("searchIcon");

  searchEngineSelect.addEventListener("change", function () {
    mainSearchInput.value = "";
    searchResultsDiv.classList.add("hidden");
    legacyResultsSection.classList.add("hidden");
    document.getElementById("selectedGamePanel").classList.add("hidden");

    if (this.value === "database") {
      mainSearchInput.placeholder = "Search for a game (e.g. Cyberpunk 2077)";
      legacyCheckBtn.classList.add("hidden");
      searchIcon.className = "fas fa-search text-github-muted";
      mainSearchInput.classList.remove("rounded-r-none");
    } else {
      mainSearchInput.placeholder = "Enter Steam AppID (e.g., 220968)";
      legacyCheckBtn.classList.remove("hidden");
      searchIcon.className = "fas fa-archive text-purple-400";
      mainSearchInput.classList.add("rounded-r-none");
    }
  });

  // Database Search Input Event
  mainSearchInput.addEventListener("input", function () {
    if (searchEngineSelect.value === "legacy") return;

    const query = this.value.toLowerCase().trim();
    searchResultsDiv.innerHTML = "";

    if (query.length < 2) {
      searchResultsDiv.classList.add("hidden");
      document.getElementById("selectedGamePanel").classList.add("hidden");
      return;
    }

    searchResultsDiv.classList.remove("hidden");

    let count = 0;
    for (const item of window.MH.searchable) {
      if (item.nameLower.includes(query) || item.appIdStr.includes(query)) {
        const appId = item.appId;
        const name = item.name;
        const type = window.MH.appTypes[appId] || "game";
        const depotCount = (window.MH.appDepots[appId] || []).length;

        const div = document.createElement("div");
        div.className = "result-item";
        div.innerHTML = `
          <img class="result-img" src="https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg" alt="${window.escapeHtml(name)}" loading="lazy" onerror="this.style.display='none'">
          <div class="result-info">
            <strong>${window.escapeHtml(name)}</strong>
            <div class="result-sub">
              <span class="badge badge-${type}">${type}</span>
              <span class="badge badge-depot">${depotCount} depot${depotCount !== 1 ? "s" : ""}</span>
              <span>AppID ${appId}</span>
            </div>
          </div>
        `;
        div.addEventListener("click", () => {
          searchResultsDiv.classList.add("hidden");
          mainSearchInput.value = name;
          window.MH_displayGameFiles(appId, name);
        });
        searchResultsDiv.appendChild(div);
        count++;
        if (count >= 20) break;
      }
    }

    if (count === 0) {
      searchResultsDiv.innerHTML =
        '<div class="no-results">🚫 No supported game matches this search.</div>';
    }
  });

  mainSearchInput.addEventListener("blur", function () {
    setTimeout(() => {
      if (
        !searchResultsDiv.matches(":hover") &&
        !mainSearchInput.matches(":focus")
      ) {
        searchResultsDiv.classList.add("hidden");
      }
    }, 200);
  });

  mainSearchInput.addEventListener("keypress", function (e) {
    if (e.key === "Enter" && searchEngineSelect.value === "legacy") {
      document.getElementById("legacyCheckBtn").click();
    }
  });

  // Initialize sub-features
  initZipDownload();
  initLegacyCheck();
};
