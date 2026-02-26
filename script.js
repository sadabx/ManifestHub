document.addEventListener("DOMContentLoaded", function () {
  // ========== MODALS ==========
  const disclaimerModal = document.getElementById("disclaimerModal");
  const unsupportedModal = document.getElementById("unsupportedModal");
  const requestedModal = document.getElementById("requestedModal");

  document.getElementById("acceptDisclaimer").addEventListener("click", function () {
    disclaimerModal.classList.add("hidden");
  });

  document.getElementById("closeUnsupportedModal").addEventListener("click", function () {
    unsupportedModal.classList.add("hidden");
  });

  document.getElementById("closeRequestedModal").addEventListener("click", function () {
    requestedModal.classList.add("hidden");
  });

  // ========== ACCORDION FUNCTIONALITY ==========
  const accordionBtn = document.getElementById("requestAccordionBtn");
  const requestFormContainer = document.getElementById("requestFormContainer");
  const accordionIcon = document.getElementById("accordionIcon");
  const appIdField = document.getElementById("appid");

  accordionBtn.addEventListener("click", function () {
    requestFormContainer.classList.toggle("hidden");
    if (requestFormContainer.classList.contains("hidden")) {
      accordionIcon.className = "fas fa-chevron-down text-purple-400";
    } else {
      accordionIcon.className = "fas fa-chevron-up text-purple-400";
      setTimeout(() => appIdField.focus(), 100);
    }
  });

  // ========== GLOBAL DATA & CONFIG ==========
  // Added your Worker URL and the Main Repo setting here
  const WORKER_URL = "https://manifesthub-bridge.sadabsiperkhan.workers.dev/";
  const REPO_OWNER = "SteamAutoCracks";

  let blacklistedGames = [];
  let requestedGames = [];
  let depotKeys = {};
  let appNames = {};
  let appTypes = {};
  let appDepots = {};
  let searchable = [];
  let cooldownUntil = 0;
  const COOLDOWN_SECONDS = 60;
  let currentAppId = null;
  let currentAppName = null;

  // ========== UTILITY FUNCTIONS ==========
  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function updateStatus(message, isError = false) {
    const statusEl = document.getElementById("statusText");
    const infoBox = document.getElementById("infoBox");
    statusEl.innerHTML = message;
    if (isError) {
      infoBox.className = "bg-red-900/30 border border-red-700/50 rounded-lg p-3 mb-4 text-sm";
    } else {
      infoBox.className = "bg-blue-900/30 border border-blue-700/50 rounded-lg p-3 mb-4 text-sm";
    }
  }

  function log(message) {
    console.log(message);
  }

  // --- NEW: Background Analytics Ping ---
  function trackEvent(appId, name) {
    fetch(`${WORKER_URL}?download=${appId}&name=${encodeURIComponent(name)}`, { mode: 'cors' })
      .catch(err => console.log("Analytics background task initiated"));
  }

  // ========== LOAD BLACKLIST AND REQUESTS ==========
  async function loadBlacklist() {
    try {
      const response = await fetch("blacklist.json");
      if (response.ok) {
        blacklistedGames = await response.json();
        if (!Array.isArray(blacklistedGames)) blacklistedGames = [];
      }
    } catch (e) {
      console.warn("Could not load blacklist.json");
    }
  }

  async function loadRequestedGames() {
    try {
      const response = await fetch("requests.json");
      if (response.ok) {
        requestedGames = await response.json();
        if (!Array.isArray(requestedGames)) requestedGames = [];
      }
    } catch (e) {
      console.warn("Could not load requests.json");
    }
  }

  // ========== LOAD DEPOT KEYS ==========
  async function loadDepotKeys() {
    updateStatus("Loading depot keys...");
    try {
      const response = await fetch("https://raw.githubusercontent.com/fylsdy/ManifestHub/refs/heads/main/depotkeys(178%2C474)(By%20Sudama).json");
      depotKeys = await response.json();
      updateStatus(`✅ Loaded ${Object.keys(depotKeys).length} depot keys`);
      document.getElementById("statDepots").textContent = Object.keys(depotKeys).length;
    } catch (e) {
      updateStatus("❌ Failed to load depot keys", true);
      console.error(e);
    }
  }

  // ========== LOAD APP LISTS ==========
  async function loadAppLists() {
    updateStatus("Loading game catalogues...");
    try {
      const gamesResponse = await fetch("https://raw.githubusercontent.com/jsnli/steamappidlist/refs/heads/master/data/games_appid.json");
      const games = await gamesResponse.json();
      games.forEach((app) => { appNames[app.appid] = app.name; appTypes[app.appid] = "game"; });

      const dlcResponse = await fetch("https://raw.githubusercontent.com/jsnli/steamappidlist/refs/heads/master/data/dlc_appid.json");
      const dlcs = await dlcResponse.json();
      dlcs.forEach((app) => { appNames[app.appid] = app.name; appTypes[app.appid] = "dlc"; });

      const softwareResponse = await fetch("https://raw.githubusercontent.com/jsnli/steamappidlist/refs/heads/master/data/software_appid.json");
      const software = await softwareResponse.json();
      software.forEach((app) => { appNames[app.appid] = app.name; appTypes[app.appid] = "software"; });

      document.getElementById("statTotal").textContent = Object.keys(appNames).length;
      buildMapping();
    } catch (e) {
      updateStatus("❌ Failed to load app lists", true);
      console.error(e);
    }
  }

  // ========== BUILD MAPPING ==========
  function buildMapping() {
    updateStatus("Building app mapping...");
    const MAX_DISTANCE = 100;
    const sortedAppids = Object.keys(appNames).map(Number).sort((a, b) => a - b);
    const raw = {};

    Object.keys(depotKeys).forEach((depotStr) => {
      const depotId = parseInt(depotStr);
      let left = 0, right = sortedAppids.length - 1;
      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (sortedAppids[mid] < depotId) left = mid + 1; else right = mid - 1;
      }

      if (left < sortedAppids.length) {
        const appId = sortedAppids[left];
        if (appId - depotId <= MAX_DISTANCE && appId >= depotId) {
          if (!raw[appId]) raw[appId] = new Set();
          raw[appId].add(depotId);
        }
      }

      if (right >= 0) {
        const appId = sortedAppids[right];
        if (depotId - appId <= MAX_DISTANCE && depotId >= appId) {
          if (!raw[appId]) raw[appId] = new Set();
          raw[appId].add(depotId);
        }
      }
    });

    appDepots = {};
    Object.keys(raw).forEach((appIdStr) => {
      const appId = parseInt(appIdStr);
      if (appNames[appId]) {
        appDepots[appId] = Array.from(raw[appId]).sort((a, b) => a - b);
      }
    });

    searchable = Object.keys(appDepots)
      .map((appId) => parseInt(appId))
      .sort((a, b) => a - b)
      .map((appId) => ({
        appId: appId,
        name: appNames[appId],
        nameLower: appNames[appId].toLowerCase(),
        appIdStr: appId.toString(),
      }));

    const supported = searchable.length;
    document.getElementById("statSupported").textContent = supported;
    document.getElementById("statsContainer").classList.remove("hidden");
    document.getElementById("searchInput").disabled = false;
    updateStatus(`✅ Ready! ${supported} supported apps`);
  }

  // ========== GENERATE LUA ==========
  function generateLua(appId, name) {
    const depots = appDepots[appId] || [];
    if (depots.length === 0) {
      updateStatus(`❌ No depots for ${name}`, true);
      return;
    }

    // --- Added Background Tracking ---
    trackEvent(appId, name + " (LUA)");
    // ---------------------------------

    const lua = [`addappid(${appId})`];
    let validCount = 0;

    for (const depot of depots) {
      const key = depotKeys[depot.toString()];
      if (key) {
        lua.push(`addappid(${depot},0,"${key}")`);
        validCount++;
      }
    }

    if (validCount === 0) {
      updateStatus(`❌ No keys for ${name}`, true);
      return;
    }

    const blob = new Blob([lua.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${appId}.lua`;
    a.click();
    URL.revokeObjectURL(url);

    updateStatus(`✅ Generated ${appId}.lua with ${validCount} depots`);
  }

  // ========== SEARCH FUNCTIONALITY ==========
  const searchInput = document.getElementById("searchInput");
  const searchResults = document.getElementById("searchResults");

  searchInput.addEventListener("input", function () {
    const query = this.value.toLowerCase().trim();
    searchResults.innerHTML = "";
    if (query.length < 2) return;

    let count = 0;
    for (const item of searchable) {
      if (item.nameLower.includes(query) || item.appIdStr.includes(query)) {
        const appId = item.appId;
        const name = item.name;
        const type = appTypes[appId] || "game";
        const depots = appDepots[appId] || [];
        const depotCount = depots.length;

        const div = document.createElement("div");
        div.className = "result-item";
        div.innerHTML = `
          <img class="result-img" src="https://cdn.akamai.steamstatic.com/steam/apps/${appId}/capsule_184x69.jpg" alt="${escapeHtml(name)}" loading="lazy" onerror="this.style.display='none'">
          <div class="result-info">
            <strong>${escapeHtml(name)}</strong>
            <div class="result-sub">
              <span class="badge badge-${type}">${type}</span>
              <span class="badge badge-depot">${depotCount} depot${depotCount !== 1 ? "s" : ""}</span>
              <span>AppID ${appId}</span>
            </div>
          </div>
          <div>
            <button class="generate-lua-btn bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-1 px-3 rounded transition-colors" data-appid="${appId}" data-name="${escapeHtml(name)}">
              <i class="fas fa-file-code mr-1"></i> LUA
            </button>
          </div>
        `;
        searchResults.appendChild(div);
        count++;
        if (count >= 50) break;
      }
    }

    if (count === 0) {
      const div = document.createElement("div");
      div.className = "no-results";
      div.innerHTML = "🚫 No supported app matches this search.";
      searchResults.appendChild(div);
    }
  });

  searchResults.addEventListener("click", function (e) {
    const btn = e.target.closest(".generate-lua-btn");
    if (btn) {
      const appId = parseInt(btn.dataset.appid);
      const name = btn.dataset.name;
      generateLua(appId, name);
    }
  });

  // ========== SMART FALLBACK MANIFEST CHECK ==========
  const checkBtn = document.getElementById("checkBtn");
  const gameIdInput = document.getElementById("gameId");
  const resultsSection = document.getElementById("resultsSection");
  const terminalOutput = document.getElementById("terminalOutput");
  const downloadSection = document.getElementById("downloadSection");
  const downloadLink = document.getElementById("downloadLink");
  const luaAlternativeSection = document.getElementById("luaAlternativeSection");
  const notFoundSection = document.getElementById("notFoundSection");
  const notFoundMessage = document.getElementById("notFoundMessage");
  const generateLuaBtn = document.getElementById("generateLuaBtn");

  async function typeText(text) {
    for (let i = 0; i < text.length; i++) {
      terminalOutput.textContent += text.charAt(i);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  async function checkManifest() {
    const gameId = gameIdInput.value.trim();

    if (!gameId || !/^\d+$/.test(gameId)) {
      alert("Please enter a valid Steam AppID (numbers only)");
      return;
    }

    checkBtn.disabled = true;
    checkBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> CHECKING...';
    resultsSection.classList.remove("hidden");
    downloadSection.classList.add("hidden");
    luaAlternativeSection.classList.add("hidden");
    notFoundSection.classList.add("hidden");
    terminalOutput.textContent = "";

    await typeText(`> Initiating manifest check for Steam AppID: ${gameId}\n`);
    await typeText(`> Searching GitHub repository...\n`);

    try {
      // --- Updated Repo URL ---
      const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/ManifestHub/branches/${gameId}`);

      if (response.status === 200) {
        await typeText(`> ✅ Manifest found in database!\n`);
        await typeText(`> Preparing download link via Worker...\n`);

        const gameName = appNames[parseInt(gameId)] || "Unknown Game";
        
        // --- Updated Tracking Download Link ---
        const trackingUrl = `${WORKER_URL}?download=${gameId}&name=${encodeURIComponent(gameName)}`;
        
        // Ensure "download" attribute isn't blocking the redirect
        downloadLink.removeAttribute("download");
        downloadLink.href = trackingUrl;
        downloadSection.classList.remove("hidden");

        checkBtn.innerHTML = '<i class="fas fa-check mr-2"></i> CHECK COMPLETE';
      } else {
        await typeText(`> ❌ Manifest not found in GitHub.\n`);
        const appIdNum = parseInt(gameId);
        if (appDepots[appIdNum] && appDepots[appIdNum].length > 0) {
          await typeText(`> 🔑 Found ${appDepots[appIdNum].length} Lua keys in local database!\n`);
          await typeText(`> 💡 You can generate Lua keys instead.\n`);
          currentAppId = appIdNum;
          currentAppName = appNames[appIdNum] || `AppID ${appIdNum}`;
          luaAlternativeSection.classList.remove("hidden");
          checkBtn.innerHTML = '<i class="fas fa-search mr-2"></i> CHECK AGAIN';
        } else {
          await typeText(`> No manifests or Lua keys found.\n`);
          notFoundMessage.textContent = "No manifests were found for this Steam application. Please request it below.";
          notFoundSection.classList.remove("hidden");
          checkBtn.innerHTML = '<i class="fas fa-search mr-2"></i> CHECK AGAIN';
        }
      }
    } catch (error) {
      await typeText(`> ⚠️ Error checking manifest. Please try again.\n`);
      checkBtn.innerHTML = '<i class="fas fa-search mr-2"></i> CHECK AGAIN';
    }
    checkBtn.disabled = false;
  }

  generateLuaBtn.addEventListener("click", function () {
    if (currentAppId) generateLua(currentAppId, currentAppName);
  });

  checkBtn.addEventListener("click", checkManifest);
  gameIdInput.addEventListener("keypress", function (e) {
    if (e.key === "Enter") checkManifest();
  });

  // ========== REQUEST FORM HANDLING ==========
  const submitBtn = document.getElementById("submitRequestBtn");
  const formFeedback = document.getElementById("formFeedback");
  const cooldownContainer = document.getElementById("cooldownContainer");
  const cooldownSeconds = document.getElementById("cooldownSeconds");

  function isGameBlacklisted(appId) { return blacklistedGames.some((game) => game.appId === appId.toString().trim()); }
  function getBlacklistedGameInfo(appId) { return blacklistedGames.find((game) => game.appId === appId.toString().trim()); }
  function isGameAlreadyRequested(appId) { return requestedGames.some((game) => game.appId === appId.toString().trim()); }
  function getRequestedGameInfo(appId) { return requestedGames.find((game) => game.appId === appId.toString().trim()); }

  function updateCooldown() {
    const now = Date.now();
    if (cooldownUntil > now) {
      const remaining = Math.ceil((cooldownUntil - now) / 1000);
      cooldownSeconds.textContent = remaining;
      cooldownContainer.classList.remove("hidden");
      submitBtn.disabled = true;
      submitBtn.classList.add("opacity-50", "cursor-not-allowed");
      setTimeout(updateCooldown, 200);
    } else {
      cooldownContainer.classList.add("hidden");
      submitBtn.disabled = false;
      submitBtn.classList.remove("opacity-50", "cursor-not-allowed");
    }
  }

  function startCooldown() {
    cooldownUntil = Date.now() + COOLDOWN_SECONDS * 1000;
    updateCooldown();
  }

  const requestForm = document.getElementById("requestForm");
  requestForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    const appId = appIdField.value.trim();
    const gameName = document.getElementById("gamename").value.trim();

    if (!appId || !gameName) {
      formFeedback.textContent = "❌ Both fields are required.";
      formFeedback.classList.add("text-red-400");
      return;
    }

    if (isGameBlacklisted(appId)) {
      const blacklistedInfo = getBlacklistedGameInfo(appId);
      const blacklistedName = blacklistedInfo ? blacklistedInfo.name : gameName;
      document.getElementById("unsupportedGameMessage").innerHTML = `The game <span class="font-bold text-orange-400">"${blacklistedName}" (AppID: ${appId})</span> is not supported.`;
      unsupportedModal.classList.remove("hidden");
      formFeedback.textContent = "❌ This game is blacklisted.";
      formFeedback.classList.add("text-red-400");
      return;
    }

    if (isGameAlreadyRequested(appId)) {
      const requestedInfo = getRequestedGameInfo(appId);
      const requestedName = requestedInfo ? requestedInfo.name : gameName;
      document.getElementById("requestedGameMessage").innerHTML = `The game <span class="font-bold text-blue-400">"${requestedName}" (AppID: ${appId})</span> has already been requested.`;
      requestedModal.classList.remove("hidden");
      formFeedback.textContent = "ℹ️ This game has already been requested.";
      formFeedback.classList.add("text-blue-400");
      return;
    }

    if (cooldownUntil > Date.now()) {
      const remain = Math.ceil((cooldownUntil - Date.now()) / 1000);
      formFeedback.textContent = `⏳ Please wait ${remain} seconds before requesting again.`;
      formFeedback.classList.add("text-orange-400");
      return;
    }

    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> SENDING...';
    formFeedback.textContent = "";

    try {
      const response = await fetch(requestForm.action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId, gameName }),
      });

      const result = await response.json();

      if (response.ok && result.status === "success") {
        formFeedback.textContent = "✅ Request sent! Thank you. (Cooldown 60s)";
        formFeedback.classList.add("text-green-400");
        requestForm.reset();
        startCooldown();
      } else {
        formFeedback.textContent = "❌ Submission failed. Please try again.";
        formFeedback.classList.add("text-red-400");
      }
    } catch (error) {
      formFeedback.textContent = "❌ Network error. Please check connection.";
      formFeedback.classList.add("text-red-400");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });

  // ========== INITIALIZE ==========
  Promise.all([loadBlacklist(), loadRequestedGames()]).then(() => {
    loadDepotKeys().then(() => {
      loadAppLists();
    });
  });
});
