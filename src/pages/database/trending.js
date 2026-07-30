// =============================================================
// trending.js — Popular Downloads Sidebar + Announcement Rotator
// =============================================================
// Loads trending download data and renders the sidebar cards.
// Also cycles status bar announcements from Supabase.
// =============================================================

/**
 * Loads trending download data from /data/trending-data.json
 * and renders cards in the #trendingGrid sidebar.
 */
window.MH_loadTrendingDownloads = async function () {
  const grid = document.getElementById("trendingGrid");
  if (!grid) return;
  try {
    const response = await fetch(`/data/trending-data.json?v=${Date.now()}`);
    if (!response.ok) throw new Error("Failed to fetch");
    const data = await response.json();

    if (!data || data.length === 0) {
      grid.innerHTML =
        '<div class="col-span-full text-github-muted text-center py-4">No trending data available.</div>';
      return;
    }

    grid.innerHTML = "";
    // Show only top 12 items
    const topItems = data.slice(0, 12);
    const mainSearchInput = document.getElementById("mainSearchInput");

    topItems.forEach((item) => {
      let name = item.gameName;
      if (name) {
        name = name.replace(/\s*\(LUA\)/gi, "").trim();
      }
      // Fallback to local catalog if the sheet name is missing or "Unknown Game"
      if (
        (!name || name.toLowerCase() === "unknown game") &&
        window.MH.appNames[item.appId]
      ) {
        name = window.MH.appNames[item.appId];
      }

      if (!name) name = "App ID " + item.appId;
      const safeName = window.escapeHtml(name);

      const formattedCount = parseInt(item.count).toLocaleString();

      const card = document.createElement("div");
      card.className = "trending-card";
      card.innerHTML = `
        <img class="trending-card-img" src="https://cdn.akamai.steamstatic.com/steam/apps/${item.appId}/header.jpg" alt="${safeName}">
        <div class="trending-card-info">
          <strong class="text-xs font-semibold text-fg truncate" title="${safeName}">${safeName}</strong>
          <span class="trending-card-meta">
            <i class="fas fa-download"></i> ${formattedCount}
          </span>
        </div>
      `;

      card.addEventListener("click", () => {
        if (mainSearchInput) mainSearchInput.value = name;
        if (typeof window.MH_displayGameFiles === "function") {
          window.MH_displayGameFiles(item.appId, name);
        }
        const selectPanel = document.getElementById("selectedGamePanel");
        if (selectPanel) selectPanel.scrollIntoView({ behavior: "smooth" });
      });

      grid.appendChild(card);
    });
  } catch (err) {
    console.warn("Failed to load trending downloads:", err);
    grid.innerHTML =
      '<div class="col-span-full text-github-muted text-center py-4">Could not load trending downloads.</div>';
  }
};

/**
 * Cycles between the "Ready!" status message and active Supabase
 * announcements every 6 seconds with a fade transition.
 * @param {number} supportedCount - Number of supported apps.
 * @param {object} supabase - The Supabase client instance.
 */
window.MH_startStatusAnnouncementCarousel = async function (supportedCount, supabase) {
  const statusText = document.getElementById("statusText");
  if (!statusText) return;

  let activeAnnouncements = [];
  try {
    const { data, error } = await supabase
      .from("announcements")
      .select("message")
      .eq("is_active", true)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order("created_at", { ascending: false });

    if (!error && data) {
      activeAnnouncements = data.map((ann) => ann.message);
    }
  } catch (e) {
    console.warn("Failed to fetch announcements:", e);
  }

  if (activeAnnouncements.length === 0) return;

  const messages = [...activeAnnouncements];
  let currentIndex = messages.length - 1;

  setInterval(() => {
    // Don't cycle if the status box is showing an error (red text)
    if (statusText.style.color) return;

    // Fade out
    statusText.style.opacity = 0;

    setTimeout(() => {
      if (statusText.style.color) {
        statusText.style.opacity = 1;
        return;
      }

      currentIndex = (currentIndex + 1) % messages.length;
      statusText.innerHTML = messages[currentIndex];

      // Fade in
      statusText.style.opacity = 1;
    }, 500); // 500ms matches the CSS transition time
  }, 6000); // Cycle every 6 seconds
};
