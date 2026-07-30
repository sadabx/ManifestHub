// =============================================================
// profile.js — Profile Page Controller
// =============================================================
// [00]  SUPABASE SETUP
// [01]  UI HELPERS (Toast, Modals, Confirm dialog)
// [02]  AUTH MODAL & LOGIC
// [03]  TAB SWITCHING
// [04]  DOWNLOAD HISTORY
// [05]  DISPLAY NAME MODAL
// [06]  CHANGE PASSWORD MODAL
// [07]  SHOW / HIDE PROFILE (Auth Gate)
// [08]  SIGN OUT BUTTONS
// [09]  UTILITIES
// [10]  AUTH STATE CHANGE (Init + Recovery + Session)
// [11]  ADMIN PANEL (Announcements + Polls)
// =============================================================

document.addEventListener("DOMContentLoaded", function () {
  // [00] SUPABASE SETUP ==========
  const SUPABASE_URL = window.SUPABASE_URL;
  const SUPABASE_KEY = window.SUPABASE_ANON_KEY;
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  let currentUser = null;
  let authMode = "login"; // "login", "signup", "forgot"

  // [01] UI HELPERS ==========

  let toastTimer = null;
  function showToast(message, type = "success") {
    const toast = document.getElementById("profileToast");
    const icon = document.getElementById("profileToastIcon");
    const msg = document.getElementById("profileToastMsg");
    if (!toast) return;

    toast.className =
      "profile-toast " + (type === "error" ? "toast-error" : "toast-success");
    icon.className =
      "fas " + (type === "error" ? "fa-exclamation-circle" : "fa-check-circle");
    msg.textContent = message;
    toast.classList.remove("hidden");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("hidden"), 3500);
  }

  function openProfileModal(id) {
    document.getElementById(id)?.classList.remove("hidden");
  }
  function closeProfileModal(id) {
    document.getElementById(id)?.classList.add("hidden");
  }

  // Generic confirm modal (replaces window.confirm)
  function openCustomConfirm(message, onConfirm) {
    document.getElementById("confirmModalMessage").textContent = message;
    openProfileModal("confirmModal");

    const okBtn = document.getElementById("confirmModalOk");
    const cancelBtn = document.getElementById("confirmModalCancel");
    const controller = new AbortController();

    closeCustomConfirm = () => {
      controller.abort();
      closeProfileModal("confirmModal");
    };

    const cleanup = () => {
      closeCustomConfirm();
    };
    const handleOk = () => {
      cleanup();
      onConfirm();
    };
    const handleCancel = () => cleanup();

    okBtn.addEventListener("click", handleOk, { signal: controller.signal });
    cancelBtn.addEventListener("click", handleCancel, { signal: controller.signal });
  }

  let closeCustomConfirm = () => {};

  // Close modals by clicking the backdrop or the × button
  document.querySelectorAll(".profile-modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        if (overlay.id === "confirmModal") closeCustomConfirm();
        else overlay.classList.add("hidden");
      }
    });
  });
  document
    .querySelectorAll(".profile-modal-close, .profile-modal-cancel")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.close;
        if (id) {
          if (id === "confirmModal") closeCustomConfirm();
          else closeProfileModal(id);
        }
      });
    });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document
        .querySelectorAll(".profile-modal-overlay:not(.hidden)")
        .forEach((el) => {
          if (el.id === "confirmModal") closeCustomConfirm();
          else el.classList.add("hidden");
        });
    }
  });

  // [02] AUTH MODAL & LOGIC ==========
  function openAuthModal(mode) {
    authMode = mode;
    updateAuthModalMode();
    document.getElementById("authModal").classList.remove("hidden");
  }

  function updateAuthModalMode() {
    const displayNameGroup = document.getElementById("displayNameGroup");
    const passwordInput = document.getElementById("authPassword");
    const passwordGroup = passwordInput?.closest(".auth-input-group");
    const forgotPasswordWrap = document.getElementById("forgotPasswordWrap");
    const authTitle = document.getElementById("authTitle");
    const authSubmitBtn = document.getElementById("authSubmitBtn");
    const switchText = document.getElementById("authSwitchText");
    const switchBtn = document.getElementById("authSwitchBtn");

    document.getElementById("authError").classList.add("hidden");

    if (authMode === "login") {
      authTitle.textContent = "Sign In";
      authSubmitBtn.textContent = "Sign In";
      if (displayNameGroup) displayNameGroup.classList.add("hidden");
      if (passwordGroup) passwordGroup.classList.remove("hidden");
      if (forgotPasswordWrap) forgotPasswordWrap.classList.remove("hidden");
      if (passwordInput) passwordInput.required = true;
      if (switchText) switchText.textContent = "Don't have an account?";
      if (switchBtn) switchBtn.textContent = "Sign Up";
    } else if (authMode === "signup") {
      authTitle.textContent = "Sign Up";
      authSubmitBtn.textContent = "Sign Up";
      if (displayNameGroup) displayNameGroup.classList.remove("hidden");
      if (passwordGroup) passwordGroup.classList.remove("hidden");
      if (forgotPasswordWrap) forgotPasswordWrap.classList.add("hidden");
      if (passwordInput) passwordInput.required = true;
      if (switchText) switchText.textContent = "Already have an account?";
      if (switchBtn) switchBtn.textContent = "Sign In";
    } else if (authMode === "forgot") {
      authTitle.textContent = "Reset Password";
      authSubmitBtn.textContent = "Send reset email";
      if (displayNameGroup) displayNameGroup.classList.add("hidden");
      if (passwordGroup) passwordGroup.classList.add("hidden");
      if (forgotPasswordWrap) forgotPasswordWrap.classList.add("hidden");
      if (passwordInput) passwordInput.required = false;
      if (switchText) switchText.textContent = "Remember your password?";
      if (switchBtn) switchBtn.textContent = "Sign In";
    }
  }

  const switchBtn = document.getElementById("authSwitchBtn");
  if (switchBtn) {
    switchBtn.addEventListener("click", () => {
      authMode = authMode === "login" ? "signup" : "login";
      updateAuthModalMode();
    });
  }

  const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
  if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener("click", () => {
      authMode = "forgot";
      updateAuthModalMode();
    });
  }

  document.getElementById("closeAuthModal").addEventListener("click", () => {
    document.getElementById("authModal").classList.add("hidden");
  });

  document
    .getElementById("gateLoginBtn")
    .addEventListener("click", () => openAuthModal("login"));
  document
    .getElementById("gateSignupBtn")
    .addEventListener("click", () => openAuthModal("signup"));

  document.getElementById("authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("authSubmitBtn");
    const errEl = document.getElementById("authError");
    errEl.classList.add("hidden");
    errEl.classList.remove("text-success"); // Reset custom color if any!
    btn.disabled = true;
    btn.textContent = "Please wait...";

    const email = document.getElementById("authEmail").value;
    const password = document.getElementById("authPassword").value;
    let error = null;

    if (authMode === "login") {
      const result = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      error = result.error;
    } else if (authMode === "signup") {
      const displayName =
        document.getElementById("authDisplayName")?.value || "";
      const result = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      });
      error = result.error;
      if (!error && result.data && !result.data.session) {
        window.handleSignupConfirmation(errEl, email, btn, supabase);
        return;
      }
    } else if (authMode === "forgot") {
      const result = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/profile/",
      });
      error = result.error;
      if (!error) {
        document.getElementById("authModal").classList.add("hidden");
        showToast("Password reset email sent! Check your inbox.");
      }
    }

    if (error) {
      console.error("Auth Error:", error);
      // Friendlier message for unconfirmed email
      if (error.message === "Email not confirmed") {
        window.handleUnconfirmedEmail(errEl, "authEmail", supabase);
      } else {
        errEl.textContent = error.message;
        errEl.classList.remove("hidden");
      }
    } else if (authMode !== "forgot") {
      document.getElementById("authModal").classList.add("hidden");
    }

    btn.disabled = false;
    btn.textContent =
      authMode === "login"
        ? "Sign In"
        : authMode === "signup"
          ? "Sign Up"
          : "Send reset email";
  });

  // [03] TAB SWITCHING ==========
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".tab-panel")
        .forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    });
  });

  if (window.location.hash === "#history") {
    document.querySelector('[data-tab="history"]').click();
  }

  // [04] DOWNLOAD HISTORY ==========
  function renderHistoryTable(items, dbErrorOccurred = false) {
    const tbody = document.getElementById("historyTableBody");
    const meta = document.getElementById("historyMeta");
    if (!tbody || !meta) return;

    meta.textContent = `${items.length} download${items.length !== 1 ? "s" : ""} total`;

    if (items.length === 0) {
      if (dbErrorOccurred) {
        tbody.innerHTML =
          '<tr class="empty-row"><td colspan="3" class="text-danger">Could not load history.</td></tr>';
        meta.textContent = "";
      } else {
        tbody.innerHTML =
          '<tr class="empty-row"><td colspan="3">No downloads yet. Go search for a game!</td></tr>';
      }
      return;
    }

    tbody.innerHTML = "";
    items.forEach((item) => {
      const tr = document.createElement("tr");
      const date = new Date(item.created_at).toLocaleString();
      const gameLabel = item.game_name
          ? item.game_name
          : `App ${item.app_id || "Unknown"}`;
      tr.innerHTML = `
      <td class="fw-500">${window.escapeHtml(gameLabel)}</td>
      <td class="text-muted">${window.escapeHtml(item.type || "Download")}</td>
      <td class="text-muted text-xs">${date}</td>
    `;
      tbody.appendChild(tr);
    });
  }

  async function loadHistory(user) {
    const tbody = document.getElementById("historyTableBody");
    const meta = document.getElementById("historyMeta");
    if (!tbody || !meta) return;

    const cacheKey = `download_history_${user.id}`;
    let cachedData = null;
    try {
      const rawCache = window.safeStorage.getItem(cacheKey);
      if (rawCache) cachedData = JSON.parse(rawCache);
    } catch (err) {
      console.error("Cache load error:", err);
    }

    if (cachedData && Array.isArray(cachedData)) {
      renderHistoryTable(cachedData);
      meta.innerHTML = `${cachedData.length} download${cachedData.length !== 1 ? "s" : ""} total <span class="text-muted text-xs ml-2"><i class="fas fa-spinner fa-spin"></i> Checking for updates...</span>`;
    } else {
      tbody.innerHTML =
        '<tr class="empty-row"><td colspan="3"><i class="fas fa-spinner spinner"></i> Loading...</td></tr>';
      meta.textContent = "Loading your downloads...";
    }

    try {
      let dbData = [];
      let dbErrorOccurred = false;

      try {
        const { data: historyData, error: historyError } = await supabase
          .from("download_history")
          .select("created_at, download_type, app_id, game_name")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50);

        if (historyError) throw historyError;

        dbData = (historyData || []).map((row) => ({
          created_at: row.created_at,
          type: row.download_type,
          app_id: row.app_id,
          game_name: row.game_name || null,
        }));

        window.safeStorage.setItem(cacheKey, JSON.stringify(dbData));
      } catch (dbErr) {
        console.error("Failed to load production Supabase history:", dbErr);
        dbErrorOccurred = true;
      }

      if (dbErrorOccurred) {
        if (!cachedData) {
          renderHistoryTable([], true);
          return;
        }

        meta.textContent = `${cachedData.length} download${cachedData.length !== 1 ? "s" : ""} total (cached)`;
        return;
      }

      const shouldUpdate =
        !cachedData ||
        JSON.stringify(cachedData) !== JSON.stringify(dbData) ||
        dbErrorOccurred;
      if (shouldUpdate) {
        renderHistoryTable(dbData, dbErrorOccurred);
      } else {
        meta.textContent = `${dbData.length} download${dbData.length !== 1 ? "s" : ""} total`;
      }
    } catch (e) {
      if (!cachedData) {
        tbody.innerHTML =
          '<tr class="empty-row"><td colspan="3" class="text-danger">Could not load history.</td></tr>';
        meta.textContent = "";
      }
      console.error(e);
    }
  }

  // [05] DISPLAY NAME MODAL ==========
  function setupUpdateNameModal(displayName) {
    const btn = document.getElementById("updateNameBtn");
    const nameInput = document.getElementById("newDisplayNameInput");
    let confirmBtn = document.getElementById("confirmUpdateNameBtn");

    btn.onclick = () => {
      nameInput.value = displayName;
      openProfileModal("updateNameModal");
      setTimeout(() => nameInput.focus(), 50);
    };

    // Replace button to remove stale listeners
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.addEventListener("click", async () => {
      const newName = nameInput.value.trim();
      if (!newName || newName === displayName) {
        closeProfileModal("updateNameModal");
        return;
      }
      newConfirmBtn.disabled = true;
      newConfirmBtn.textContent = "Saving...";

      const { data, error } = await supabase.auth.updateUser({
        data: { display_name: newName },
      });
      newConfirmBtn.disabled = false;
      newConfirmBtn.textContent = "Save Changes";

      if (error) {
        showToast(error.message, "error");
      } else {
        closeProfileModal("updateNameModal");
        showToast("Display name updated!");
        showProfile(data.user);
      }
    });

    nameInput.onkeydown = (e) => {
      if (e.key === "Enter") newConfirmBtn.click();
    };
  }

  // [06] CHANGE PASSWORD MODAL ==========
  function setupChangePasswordModal() {
    const btn = document.getElementById("changePasswordBtn");
    let confirmBtn = document.getElementById("confirmChangePasswordBtn");
    const pwInput = document.getElementById("newPasswordInput");
    const cfInput = document.getElementById("confirmPasswordInput");
    const errEl = document.getElementById("passwordModalError");

    btn.onclick = () => {
      pwInput.value = "";
      cfInput.value = "";
      errEl.classList.add("hidden");
      openProfileModal("changePasswordModal");
      setTimeout(() => pwInput.focus(), 50);
    };

    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.addEventListener("click", async () => {
      const pw = pwInput.value;
      const cf = cfInput.value;

      if (!pw) {
        errEl.textContent = "Please enter a new password.";
        errEl.classList.remove("hidden");
        return;
      }
      if (pw !== cf) {
        errEl.textContent = "Passwords do not match.";
        errEl.classList.remove("hidden");
        return;
      }
      errEl.classList.add("hidden");

      newConfirmBtn.disabled = true;
      newConfirmBtn.textContent = "Updating...";
      const { error } = await supabase.auth.updateUser({ password: pw });
      newConfirmBtn.disabled = false;
      newConfirmBtn.textContent = "Update Password";

      if (error) {
        errEl.textContent = error.message;
        errEl.classList.remove("hidden");
      } else {
        closeProfileModal("changePasswordModal");
        showToast("Password updated successfully!");
      }
    });
  }

  // [07] SHOW / HIDE PROFILE ==========
  function showProfile(user) {
    currentUser = user;
    document.getElementById("authGate").style.display = "none";
    document.getElementById("profileContent").style.display = "block";

    const displayName =
      user.user_metadata?.display_name || user.email?.split("@")[0] || "User";
    document.getElementById("avatarCircle").textContent =
      displayName[0].toUpperCase();
    document.getElementById("profileDisplayName").textContent = displayName;
    document.getElementById("profileEmail").textContent = user.email;
    document.getElementById("settingsEmail").textContent = user.email;
    document.getElementById("settingsDisplayName").textContent = displayName;

    const joinDate = user.created_at
      ? new Date(user.created_at).toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
        })
      : "";
    document.getElementById("profileMeta").textContent = joinDate
      ? `Member since ${joinDate}`
      : "ManifestHub Member";

    setupUpdateNameModal(displayName);
    setupChangePasswordModal();
    loadHistory(user);

    // Check if user is an admin dynamically to avoid leaking emails in the public repository
    (async () => {
      try {
        const { data, error } = await supabase
          .from("admins")
          .select("email")
          .eq("email", user.email)
          .maybeSingle();

        if (!error && data) {
          document.getElementById("adminTabBtn")?.classList.remove("hidden");
          setupAdminPanel(user);
        } else {
          document.getElementById("adminTabBtn")?.classList.add("hidden");
        }
      } catch (e) {
        document.getElementById("adminTabBtn")?.classList.add("hidden");
      }
    })();
  }
  function showAuthGate() {
    currentUser = null;
    document.getElementById("authGate").style.display = "block";
    document.getElementById("profileContent").style.display = "none";
  }

  // [08] SIGN OUT BUTTONS ==========
  document.getElementById("signOutBtn").addEventListener("click", async () => {
    await supabase.auth.signOut();
  });
  document
    .getElementById("signOutEverywhereBtn")
    .addEventListener("click", () => {
      openCustomConfirm("Sign out from all sessions?", async () => {
        await supabase.auth.signOut({ scope: "global" });
      });
    });

  // [09] UTILITIES ==========

  // [10] AUTH STATE CHANGE ==========
  // Runs once on page load to restore an existing session,
  // then handles login, logout, token refresh, and password recovery events.
  (async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) showProfile(session.user);
    else showAuthGate();
  })();

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      const recoveryInput = document.getElementById("recoveryPasswordInput");
      let recoveryBtn = document.getElementById("confirmRecoveryPasswordBtn");
      const recoveryErr = document.getElementById("recoveryModalError");

      recoveryInput.value = "";
      recoveryErr.classList.add("hidden");
      openProfileModal("passwordRecoveryModal");

      const newBtn = recoveryBtn.cloneNode(true);
      recoveryBtn.parentNode.replaceChild(newBtn, recoveryBtn);

      newBtn.addEventListener("click", async () => {
        const newPassword = recoveryInput.value;
        if (!newPassword) {
          recoveryErr.textContent = "Please enter a new password.";
          recoveryErr.classList.remove("hidden");
          return;
        }
        newBtn.disabled = true;
        newBtn.textContent = "Saving...";

        const { data, error } = await supabase.auth.updateUser({
          password: newPassword,
        });
        newBtn.disabled = false;
        newBtn.textContent = "Set New Password";

        if (error) {
          recoveryErr.textContent = error.message;
          recoveryErr.classList.remove("hidden");
        } else {
          closeProfileModal("passwordRecoveryModal");
          showToast("Password updated successfully! You are now logged in.");
          showProfile(data.user);
        }
      });
    } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
      if (session?.user) showProfile(session.user);
    } else if (event === "SIGNED_OUT") {
      showAuthGate();
    }
  });

  // [11] ADMIN PANEL ==========
  async function setupAdminPanel(user) {
    const form = document.getElementById("adminAnnouncementForm");
    if (!form) return;

    // Clone form node to prevent duplicate event listeners on re-entry
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);

    const announceDays = newForm.querySelector("#announceDays");
    const announceHours = newForm.querySelector("#announceHours");
    const announceMins = newForm.querySelector("#announceMins");
    const announcePermanent = newForm.querySelector("#announcePermanent");
    const durationInputs = newForm.querySelector("#durationInputs");

    // Populate dropdowns
    if (announceDays && announceDays.options.length === 0) {
      for (let i = 0; i <= 7; i++) {
        announceDays.add(new Option(i, i));
      }
      for (let i = 0; i <= 23; i++) {
        announceHours.add(new Option(i, i));
      }
      for (let i = 0; i <= 59; i++) {
        announceMins.add(new Option(i, i));
      }
      announceDays.value = "1";
    }

    // Toggle inputs when Infinite is clicked
    announcePermanent.addEventListener("click", () => {
      const isCurrentlyActive = announcePermanent.classList.toggle("active");
      if (isCurrentlyActive) {
        durationInputs.style.opacity = "0.5";
        announceDays.disabled = true;
        announceHours.disabled = true;
        announceMins.disabled = true;
      } else {
        durationInputs.style.opacity = "1";
        announceDays.disabled = false;
        announceHours.disabled = false;
        announceMins.disabled = false;
      }
    });

    newForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = newForm.querySelector("#announceSubmitBtn");
      const msgInput = newForm.querySelector("#announceMessage");

      const message = msgInput.value.trim();
      if (!message) return;

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

      let expiresAt = null;
      if (!announcePermanent.classList.contains("active")) {
        const d = parseInt(announceDays.value, 10) || 0;
        const h = parseInt(announceHours.value, 10) || 0;
        const m = parseInt(announceMins.value, 10) || 0;

        const totalMs =
          d * 24 * 60 * 60 * 1000 + h * 60 * 60 * 1000 + m * 60 * 1000;

        if (totalMs > 0) {
          expiresAt = new Date(Date.now() + totalMs).toISOString();
        } else {
          showToast(
            "Duration must be greater than 0 if not Infinite.",
            "error",
          );
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fas fa-plus"></i>';
          return;
        }
      }

      const { error } = await supabase
        .from("announcements")
        .insert([{ message, expires_at: expiresAt, created_by: user.id }]);

      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-plus"></i>';

      if (error) {
        showToast("Failed to create announcement: " + error.message, "error");
      } else {
        showToast("Announcement added successfully!");
        msgInput.value = "";
        announceDays.value = "1";
        announceHours.value = "0";
        announceMins.value = "0";
        announcePermanent.classList.remove("active");
        durationInputs.style.opacity = "1";
        announceDays.disabled = false;
        announceHours.disabled = false;
        announceMins.disabled = false;
        loadAnnouncements();
      }
    });

    loadAnnouncements();

    // ===== POLL MANAGER INITIALIZATION =====
    const pollForm = document.getElementById("adminPollForm");
    if (pollForm) {
      // Re-create node to clear existing listeners if any
      const newPollForm = pollForm.cloneNode(true);
      pollForm.parentNode.replaceChild(newPollForm, pollForm);

      newPollForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitBtn = newPollForm.querySelector("#pollSubmitBtn");
        const questionInput = newPollForm.querySelector("#pollQuestionInput");
        const optionsInput = newPollForm.querySelector("#pollOptionsInput");

        const question = questionInput.value.trim();
        const optionsText = optionsInput.value.trim();

        if (!question || !optionsText) return;

        const options = optionsText
          .split(",")
          .map((opt) => opt.trim())
          .filter(Boolean);
        if (options.length < 2) {
          showToast("Please provide at least 2 options.", "error");
          return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML =
          '<i class="fas fa-spinner fa-spin"></i> Creating...';

        // 1. Deactivate other active polls first
        const { error: deactivateError } = await supabase
          .from("polls")
          .update({ is_active: false })
          .eq("is_active", true);

        if (deactivateError) {
          console.error("Failed to deactivate active polls:", deactivateError);
        }

        // 2. Insert new active poll
        const { error: insertError } = await supabase.from("polls").insert([
          {
            question: question,
            options: options,
            is_active: true,
            created_by: user.id,
          },
        ]);

        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-plus"></i> Create Poll';

        if (insertError) {
          showToast("Failed to create poll: " + insertError.message, "error");
        } else {
          questionInput.value = "";
          optionsInput.value = "Yes, No";
          showToast("Poll created successfully!");
          loadAdminPolls();
        }
      });

      // Load initially
      loadAdminPolls();
    }
  }

  async function loadAnnouncements() {
    const listEl = document.getElementById("announcementList");
    if (!listEl) return;

    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      listEl.innerHTML = `<div class="status-msg-box status-msg-error">Failed to load announcements: ${error.message}</div>`;
      return;
    }

    if (!data || data.length === 0) {
      listEl.innerHTML = `<div class="status-msg-box status-msg-info">No announcements configured.</div>`;
      return;
    }

    listEl.innerHTML = "";
    data.forEach((ann) => {
      const isExpired = ann.expires_at && new Date(ann.expires_at) < new Date();
      const div = document.createElement("div");
      div.className = "announcement-item";

      let expiryLabel = "Permanent";
      if (ann.expires_at) {
        const dateStr = new Date(ann.expires_at).toLocaleString();
        expiryLabel = isExpired
          ? `<span class="text-danger">Expired at ${dateStr}</span>`
          : `Expires at ${dateStr}`;
      }

      div.innerHTML = `
        <div class="ann-item-body">
          <div class="ann-item-message ${isExpired ? "expired" : "active"}">${window.escapeHtml(ann.message)}</div>
          <div class="ann-item-expiry">${expiryLabel}</div>
        </div>
        <div class="ann-actions-wrap">
          <button class="edit-ann-btn btn-secondary ann-action-btn-small" data-id="${ann.id}" title="Edit announcement">
            <i class="fas fa-edit"></i>
          </button>
          <button class="toggle-active-btn btn-secondary ann-action-btn-small" data-id="${ann.id}" data-active="${ann.is_active}">
            ${ann.is_active ? '<i class="fas fa-eye"></i> Active' : '<i class="fas fa-eye-slash"></i> Inactive'}
          </button>
          <button class="delete-ann-btn btn-danger ann-action-btn-small" data-id="${ann.id}">
            <i class="fas fa-trash-alt"></i>
          </button>
        </div>
      `;

      // Edit announcement inline
      div.querySelector(".edit-ann-btn").addEventListener("click", () => {
        let isPerm = !ann.expires_at;
        let dVal = 1,
          hVal = 0,
          mVal = 0;
        if (ann.expires_at) {
          const diffMs = new Date(ann.expires_at) - Date.now();
          if (diffMs > 0) {
            const totalMins = Math.ceil(diffMs / 60000);
            dVal = Math.floor(totalMins / (24 * 60));
            hVal = Math.floor((totalMins % (24 * 60)) / 60);
            mVal = totalMins % 60;
          }
        }

        div.innerHTML = `
          <div class="ann-edit-form-wrap">
            <input type="text" class="edit-ann-input ann-edit-input" value="${window.escapeHtml(ann.message)}" required />
            <div class="ann-edit-dur-flex">
              <div class="admin-expiration-capsule admin-expiration-capsule-small">
                <button type="button" class="admin-permanent-btn edit-ann-perm-btn ${isPerm ? "active" : ""}" title="Infinite Expiration" style="font-size: 1rem;">∞</button>
                <div class="admin-capsule-divider" style="height: 1rem;"></div>
                <div class="edit-ann-dur-wrap" style="display:${isPerm ? "none" : "flex"}; gap:0.25rem; align-items:center; opacity:${isPerm ? "0.5" : "1"};">
                  <label class="admin-select-label" style="font-size: 0.75rem;">
                    <select class="edit-ann-days admin-capsule-select" style="font-size:0.75rem;" ${isPerm ? "disabled" : ""}></select>d
                  </label>
                  <label class="admin-select-label" style="font-size: 0.75rem;">
                    <select class="edit-ann-hours admin-capsule-select" style="font-size:0.75rem;" ${isPerm ? "disabled" : ""}></select>h
                  </label>
                  <label class="admin-select-label" style="font-size: 0.75rem;">
                    <select class="edit-ann-mins admin-capsule-select" style="font-size:0.75rem;" ${isPerm ? "disabled" : ""}></select>m
                  </label>
                </div>
              </div>
            </div>
          </div>
          <div class="ann-actions-wrap">
            <button class="save-ann-btn btn-primary ann-action-btn-small" data-id="${ann.id}">
              <i class="fas fa-check"></i> Save
            </button>
            <button class="cancel-ann-btn btn-secondary ann-action-btn-small" data-id="${ann.id}">
              <i class="fas fa-times"></i> Cancel
            </button>
          </div>
        `;

        const editDays = div.querySelector(".edit-ann-days");
        const editHours = div.querySelector(".edit-ann-hours");
        const editMins = div.querySelector(".edit-ann-mins");
        const editPermBtn = div.querySelector(".edit-ann-perm-btn");
        const editDurWrap = div.querySelector(".edit-ann-dur-wrap");

        for (let i = 0; i <= 7; i++) editDays.add(new Option(i, i));
        for (let i = 0; i <= 23; i++) editHours.add(new Option(i, i));
        for (let i = 0; i <= 59; i++) editMins.add(new Option(i, i));

        editDays.value = String(dVal);
        editHours.value = String(hVal);
        editMins.value = String(mVal);

        editPermBtn.addEventListener("click", () => {
          const isCurrentlyActive = editPermBtn.classList.toggle("active");
          if (isCurrentlyActive) {
            editDurWrap.style.display = "none";
            editDays.disabled = true;
            editHours.disabled = true;
            editMins.disabled = true;
          } else {
            editDurWrap.style.display = "flex";
            editDays.disabled = false;
            editHours.disabled = false;
            editMins.disabled = false;
          }
        });

        div.querySelector(".cancel-ann-btn").addEventListener("click", () => {
          loadAnnouncements();
        });

        div
          .querySelector(".save-ann-btn")
          .addEventListener("click", async (e) => {
            const inputVal = div.querySelector(".edit-ann-input").value.trim();
            if (!inputVal) {
              showToast("Message cannot be empty.", "error");
              return;
            }

            e.currentTarget.disabled = true;
            e.currentTarget.innerHTML =
              '<i class="fas fa-spinner fa-spin"></i>';

            let expiresAt = null;
            const isPermanent = editPermBtn.classList.contains("active");
            if (!isPermanent) {
              const d = parseInt(editDays.value, 10) || 0;
              const h = parseInt(editHours.value, 10) || 0;
              const m = parseInt(editMins.value, 10) || 0;
              const totalMs =
                d * 24 * 60 * 60 * 1000 + h * 60 * 60 * 1000 + m * 60 * 1000;

              if (totalMs > 0) {
                expiresAt = new Date(Date.now() + totalMs).toISOString();
              } else {
                showToast(
                  "Duration must be greater than 0 if not Permanent.",
                  "error",
                );
                e.currentTarget.disabled = false;
                e.currentTarget.innerHTML = '<i class="fas fa-check"></i> Save';
                return;
              }
            }

            const { error } = await supabase
              .from("announcements")
              .update({ message: inputVal, expires_at: expiresAt })
              .eq("id", ann.id);

            if (error) {
              showToast(
                "Failed to update announcement: " + error.message,
                "error",
              );
              e.currentTarget.disabled = false;
              e.currentTarget.innerHTML = '<i class="fas fa-check"></i> Save';
            } else {
              showToast("Announcement updated successfully!");
              loadAnnouncements();
            }
          });
      });

      // Toggle active status
      div
        .querySelector(".toggle-active-btn")
        .addEventListener("click", async (e) => {
          const id = e.currentTarget.dataset.id;
          const currentActive = e.currentTarget.dataset.active === "true";
          e.currentTarget.disabled = true;

          const { error } = await supabase
            .from("announcements")
            .update({ is_active: !currentActive })
            .eq("id", id);

          if (error) {
            showToast("Failed to toggle status: " + error.message, "error");
            e.currentTarget.disabled = false;
          } else {
            loadAnnouncements();
          }
        });

      // Delete announcement
      div.querySelector(".delete-ann-btn").addEventListener("click", (e) => {
        const id = e.currentTarget.dataset.id;
        openCustomConfirm("Delete this announcement?", async () => {
          const { error } = await supabase
            .from("announcements")
            .delete()
            .eq("id", id);

          if (error) {
            showToast("Failed to delete: " + error.message, "error");
          } else {
            showToast("Announcement deleted!");
            loadAnnouncements();
          }
        });
      });

      listEl.appendChild(div);
    });
  }

  // ===== POLL MANAGER RENDER & ACTIONS =====
  async function loadAdminPolls() {
    const pollsListEl = document.getElementById("adminPollsList");
    if (!pollsListEl) return;
    pollsListEl.innerHTML =
      '<div class="status-msg-box status-msg-info">Loading polls...</div>';

    try {
      // 1. Fetch all polls
      const { data: polls, error: pollsError } = await supabase
        .from("polls")
        .select("*")
        .order("created_at", { ascending: false });

      if (pollsError) {
        pollsListEl.innerHTML = `<div class="status-msg-box status-msg-error">Failed to load polls: ${pollsError.message}</div>`;
        return;
      }

      if (!polls || polls.length === 0) {
        pollsListEl.innerHTML =
          '<div class="status-msg-box status-msg-info">No polls created yet.</div>';
        return;
      }

      // 2. Fetch all votes to count totals in memory
      // (Using a single select is highly efficient to prevent N+1 query problem)
      const { data: votesData, error: votesError } = await supabase
        .from("poll_votes")
        .select("poll_id, vote_option");

      if (votesError) {
        console.warn("Failed to fetch votes for calculations:", votesError);
      }

      // Map votes: pollId -> { option -> count }
      const votesCounts = {};
      polls.forEach((p) => {
        votesCounts[p.id] = {};
        p.options.forEach((opt) => (votesCounts[p.id][opt] = 0));
      });

      if (votesData) {
        votesData.forEach((v) => {
          if (votesCounts[v.poll_id]) {
            votesCounts[v.poll_id][v.vote_option] =
              (votesCounts[v.poll_id][v.vote_option] || 0) + 1;
          }
        });
      }

      pollsListEl.innerHTML = "";

      polls.forEach((poll) => {
        const div = document.createElement("div");
        div.className = "admin-poll-card";

        const pVotes = votesCounts[poll.id] || {};
        const totalVotes = Object.values(pVotes).reduce((a, b) => a + b, 0);
        const optionsBreakdown = poll.options
          .map((opt) => {
            const votes = pVotes[opt] || 0;
            const percent =
              totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
            return `${opt}: ${votes} (${percent}%)`;
          })
          .join(" | ");

        div.innerHTML = `
          <div class="admin-poll-info">
            <div class="poll-item-header">
              <strong class="poll-item-question">${window.escapeHtml(poll.question)}</strong>
              <span class="badge poll-item-badge ${poll.is_active ? "active" : "inactive"}">
                ${poll.is_active ? "Active" : "Closed"}
              </span>
            </div>
            <div class="poll-item-meta">
              ${optionsBreakdown} &middot; Total: ${totalVotes} votes
            </div>
          </div>
          <div class="admin-poll-actions">
            <button class="toggle-poll-btn btn-secondary poll-action-btn-small" data-id="${poll.id}" data-active="${poll.is_active}">
              ${poll.is_active ? "Close" : "Activate"}
            </button>
            <button class="delete-poll-btn btn-danger poll-action-btn-small" data-id="${poll.id}">
              Delete
            </button>
          </div>
        `;

        // Toggle active status
        div
          .querySelector(".toggle-poll-btn")
          .addEventListener("click", async (e) => {
            const id = e.currentTarget.dataset.id;
            const isCurrentlyActive = e.currentTarget.dataset.active === "true";
            e.currentTarget.disabled = true;

            const newActiveState = !isCurrentlyActive;

            // If turning active, deactivate all other polls first
            if (newActiveState) {
              const { error: deacError } = await supabase
                .from("polls")
                .update({ is_active: false })
                .eq("is_active", true);

              if (deacError) {
                console.error("Failed to deactivate polls:", deacError);
              }
            }

            const { error: activeError } = await supabase
              .from("polls")
              .update({ is_active: newActiveState })
              .eq("id", id);

            if (activeError) {
              showToast(
                "Failed to toggle status: " + activeError.message,
                "error",
              );
              e.currentTarget.disabled = false;
            } else {
              showToast(newActiveState ? "Poll activated!" : "Poll closed!");
              loadAdminPolls();
            }
          });

        // Delete poll
        div.querySelector(".delete-poll-btn").addEventListener("click", (e) => {
          const id = e.currentTarget.dataset.id;
          openCustomConfirm("Delete this poll?", async () => {
            const { error: deleteError } = await supabase
              .from("polls")
              .delete()
              .eq("id", id);

            if (deleteError) {
              showToast(
                "Failed to delete poll: " + deleteError.message,
                "error",
              );
            } else {
              showToast("Poll deleted!");
              loadAdminPolls();
            }
          });
        });

        pollsListEl.appendChild(div);
      });
    } catch (err) {
      console.error("Error in loadAdminPolls:", err);
      pollsListEl.innerHTML = `<div class="status-msg-box status-msg-error">Error loading polls: ${err.message || err}</div>`;
    }
  }


});
