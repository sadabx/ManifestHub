// =============================================================
// presence.js — Live Viewer Count
// =============================================================
// Tracks real-time visitor count using Supabase Realtime
// presence channels with a stable per-session ID.
// =============================================================

/**
 * Initializes the live viewer count via Supabase Realtime presence.
 * @param {object} supabase - The Supabase client instance.
 */
window.MH_initPresence = function (supabase) {
  let sessionId = sessionStorage.getItem("mhub_sid");
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem("mhub_sid", sessionId);
  }

  const presenceChannel = supabase.channel("site-presence", {
    config: { presence: { key: sessionId } },
  });

  let rafId = null;
  presenceChannel
    .on("presence", { event: "sync" }, () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        const count = Object.keys(presenceChannel.presenceState()).length;
        const el = document.getElementById("viewerCountNum");
        if (el) el.textContent = count;
        rafId = null;
      });
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await presenceChannel.track({ joined_at: Date.now() });
      }
    });

  window.addEventListener("beforeunload", () => {
    presenceChannel.untrack();
  });
};
