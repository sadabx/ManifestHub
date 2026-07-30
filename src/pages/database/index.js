// =============================================================
// main.js — Entry Point Orchestrator
// =============================================================
// Creates the Supabase client, initializes the shared MH
// namespace, and wires up all feature modules.
//
// Load order (in index.html):
//   core/config.js -> core/utils.js -> components/presence.js
//   -> components/auth.js -> pages/database/database.js
//   -> pages/database/search.js -> pages/database/trending.js
//   -> components/poll.js -> components/faq.js -> pages/database/index.js
// =============================================================

document.addEventListener("DOMContentLoaded", function () {
  // Shared namespace for cross-module state
  window.MH = {
    supabase: null,
    currentUser: null,
    appNames: {},
    appTypes: {},
    appDepots: {},
    depotKeys: {},
    searchable: [],
    denuvoAppIds: new Set(),
    _authMode: "login",
  };

  // Create the single Supabase client instance
  const supabase = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY,
  );
  window.MH.supabase = supabase;

  // ---- Initialize all feature modules ----

  // Live viewer count
  window.MH_initPresence(supabase);

  // Auth modal, form, dropdown, state listener
  window.MH_initAuth(supabase);

  const authParams = new URLSearchParams(window.location.search);
  if (authParams.get("auth") === "login") {
    window.MH_openAuthModal("login");
  }

  // Disclaimer modal — show on first visit
  const disclaimerModal = document.getElementById("disclaimerModal");
  if (
    authParams.get("auth") !== "login" &&
    !window.safeStorage.getItem("disclaimerAccepted")
  ) {
    disclaimerModal.classList.remove("hidden");
  }
  document
    .getElementById("acceptDisclaimer")
    .addEventListener("click", function () {
      const dontShow = document.getElementById("dontShowAgain").checked;
      if (dontShow) {
        window.safeStorage.setItem("disclaimerAccepted", "true");
      }
      disclaimerModal.classList.add("hidden");
    });

  // Search engine, game panel, downloads, legacy check
  window.MH_initSearch();

  // FAQ accordion
  window.MH_initFAQ();

  // Database initialization (triggers trending load internally)
  window.MH_initDatabase(supabase);

  // Note: initPollWidget() is intentionally NOT called here.
  // It is invoked by onAuthStateChange (in auth.js), which fires immediately
  // on page load with the current session, ensuring correct auth context.

  // Wire up the donate address copy button
  const donateCopyBtn = document.getElementById("donateCopyBtn");
  if (donateCopyBtn) {
    donateCopyBtn.addEventListener("click", () => {
      navigator.clipboard
        .writeText("TFErnymvTdBtw9g79QHfuRojjwwA6HEc6B")
        .then(() => {
          donateCopyBtn.textContent = "Copied!";
          setTimeout(() => (donateCopyBtn.textContent = "Copy"), 2000);
        });
    });
  }
});
