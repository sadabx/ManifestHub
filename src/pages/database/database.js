// =============================================================
// database.js — Database Initialization & App Mapping
// =============================================================
// Loads depot keys, app lists (games/DLC/software), and the
// denuvo list. Builds the searchable index and populates
// window.MH shared state.
// =============================================================

/**
 * Updates the status bar message and icon color.
 * @param {string} message - The status message HTML.
 * @param {boolean} isError - If true, shows error styling.
 */
window.MH_updateStatus = function (message, isError = false) {
  const statusEl = document.getElementById("statusText");
  const infoBox = document.getElementById("infoBox");
  const icon = infoBox.querySelector("i");
  statusEl.innerHTML = message;
  if (isError) {
    statusEl.style.color = "#f85149";
    if (icon) {
      icon.className = "fas fa-exclamation-triangle mr-2";
      icon.style.color = "#f85149";
    }
  } else {
    statusEl.style.color = "";
  }
};

/**
 * Initializes the database: fetches depot keys, app lists,
 * builds mappings, and enables search.
 * @param {object} supabase - The Supabase client instance.
 */
window.MH_initDatabase = async function (supabase) {
  window.MH_updateStatus("Initializing database...");

  const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours

  async function fetchCachedJson(url, maxAgeMs = CACHE_DURATION) {
    if (typeof window === "undefined" || !("caches" in window) || !window.caches) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }
    try {
      const cache = await window.caches.open("manifesthub-db-cache");
      const cachedResponse = await cache.match(url);
      const lastFetch = window.safeStorage.getItem("cache-time-" + url);
      if (
        cachedResponse &&
        lastFetch &&
        Date.now() - parseInt(lastFetch) < maxAgeMs
      ) {
        return await cachedResponse.json();
      }
    } catch (e) {
      console.warn("Cache read failed, fetching fresh...", e);
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    try {
      const cache = await window.caches.open("manifesthub-db-cache");
      await cache.put(url, res.clone());
      window.safeStorage.setItem("cache-time-" + url, Date.now().toString());
    } catch (e) {
      console.warn("Cache write failed...", e);
    }
    return res.json();
  }

  async function fetchWithFallback(path) {
    // Source: jsnli/steamappidlist
    // Purpose: Main database to map game names to Steam AppIDs for lookup.
    const bases = [
      "https://raw.githubusercontent.com/jsnli/steamappidlist/refs/heads/main/data/",
      "https://raw.githubusercontent.com/jsnli/steamappidlist/refs/heads/master/data/",
    ];
    for (const base of bases) {
      try {
        return await fetchCachedJson(base + path);
      } catch (e) {
        /* try next */
      }
    }
    throw new Error("All mirrors failed for " + path);
  }

  try {
    const [depotKeysData, games, dlcs, sw, denuvoData] = await Promise.all([
      // Source: fylsdy/ManifestHub
      // Purpose: Downloads depot keys to locally generate the .lua files.
      fetchCachedJson(
        "https://raw.githubusercontent.com/fylsdy/ManifestHub/main/depotkeys.json",
      ),
      fetchWithFallback("games_appid.json"),
      fetchWithFallback("dlc_appid.json"),
      fetchWithFallback("software_appid.json"),
      fetch("data/denuvo-games.json")
        .then((r) => r.json())
        .catch(() => []),
    ]);

    window.MH.depotKeys = depotKeysData;
    window.MH.denuvoAppIds = new Set(denuvoData);
    window.MH_updateStatus(`Loaded ${Object.keys(window.MH.depotKeys).length} depot keys`);

    games.forEach((app) => {
      window.MH.appNames[app.appid] = app.name;
      window.MH.appTypes[app.appid] = "game";
    });
    dlcs.forEach((app) => {
      window.MH.appNames[app.appid] = app.name;
      window.MH.appTypes[app.appid] = "dlc";
    });
    sw.forEach((app) => {
      window.MH.appNames[app.appid] = app.name;
      window.MH.appTypes[app.appid] = "software";
    });

    if (Object.keys(window.MH.appNames).length === 0) {
      window.MH_updateStatus("Failed to load app lists. Check connection.", true);
      return;
    }

    buildMapping(supabase);
    await window.MH_loadTrendingDownloads();
  } catch (err) {
    console.error("Database initialization failed:", err);
    window.MH_updateStatus("Failed to initialize database. Check connection.", true);
  }
};

/**
 * Builds the depot-to-app mapping and the searchable index.
 * Enables the search input and handles URL query parameters.
 * @param {object} supabase - The Supabase client instance.
 */
function buildMapping(supabase) {
  window.MH_updateStatus("Building app mapping...");
  const appNames = window.MH.appNames;
  const depotKeys = window.MH.depotKeys;

  // Max numeric distance between a depot ID and its parent AppID in the Steam catalog.
  // Steam depot IDs are always numerically close to their parent AppID (empirically within 100).
  const DEPOT_MAP_MAX_DISTANCE = 100;
  const sortedAppids = Object.keys(appNames)
    .map(Number)
    .sort((a, b) => a - b);
  const raw = {};

  Object.keys(depotKeys).forEach((depotStr) => {
    const depotId = parseInt(depotStr);
    let left = 0,
      right = sortedAppids.length - 1;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (sortedAppids[mid] < depotId) left = mid + 1;
      else right = mid - 1;
    }
    if (left < sortedAppids.length) {
      const appId = sortedAppids[left];
      if (appId - depotId <= DEPOT_MAP_MAX_DISTANCE && appId >= depotId) {
        if (!raw[appId]) raw[appId] = new Set();
        raw[appId].add(depotId);
      }
    }
    if (right >= 0) {
      const appId = sortedAppids[right];
      if (depotId - appId <= DEPOT_MAP_MAX_DISTANCE && depotId >= appId) {
        if (!raw[appId]) raw[appId] = new Set();
        raw[appId].add(depotId);
      }
    }
  });

  window.MH.appDepots = {};
  Object.keys(raw).forEach((appIdStr) => {
    const appId = parseInt(appIdStr);
    if (appNames[appId]) {
      window.MH.appDepots[appId] = Array.from(raw[appId]).sort((a, b) => a - b);
    }
  });

  window.MH.searchable = Object.keys(window.MH.appDepots)
    .map((appId) => parseInt(appId))
    .sort((a, b) => a - b)
    .map((appId) => ({
      appId,
      name: appNames[appId],
      nameLower: appNames[appId].toLowerCase(),
      appIdStr: appId.toString(),
    }));

  const supported = window.MH.searchable.length;

  const searchInput = document.getElementById("mainSearchInput");
  searchInput.disabled = false;
  searchInput.style.opacity = "1";
  searchInput.style.cursor = "";
  searchInput.placeholder = "Search for a game (e.g. Cyberpunk 2077)";

  const infoBox = document.getElementById("infoBox");
  const icon = infoBox.querySelector("i");
  if (icon) {
    icon.className = "fas fa-check mr-2";
    icon.style.color = "#3fb950";
  }
  window.MH_updateStatus(`Ready! ${supported.toLocaleString()} supported apps.`);
  window.MH_startStatusAnnouncementCarousel(supported, supabase);

  // Handle URL query parameters for search routing
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get("q") || urlParams.get("search");
    const appIdParam = urlParams.get("appid") || urlParams.get("appId");

    if (appIdParam) {
      const appIdNum = parseInt(appIdParam);
      if (appIdNum && appNames[appIdNum]) {
        searchInput.value = appNames[appIdNum];
        window.MH_displayGameFiles(appIdNum, appNames[appIdNum]);
      } else if (appIdNum) {
        // Switch to legacy check and trigger search
        const searchSelect = document.getElementById("searchEngineSelect");
        if (searchSelect) {
          searchSelect.value = "legacy";
          searchSelect.dispatchEvent(new Event("change"));
        }
        searchInput.value = appIdParam;
        const checkBtn = document.getElementById("legacyCheckBtn");
        if (checkBtn) {
          checkBtn.click();
        }
      }
    } else if (query) {
      searchInput.value = query;
      searchInput.dispatchEvent(new Event("input"));
    }
  } catch (e) {
    console.warn("Failed to parse URL query parameters:", e);
  }
}
