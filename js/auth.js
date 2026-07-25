// =============================================================
// auth.js — Authentication Modal & User UI
// =============================================================
// Handles the auth modal (sign in / sign up / forgot password),
// the logged-in user dropdown menu, and auth state changes.
// =============================================================

/**
 * Opens the authentication modal in the specified mode.
 * Exposed globally so other modules (e.g., poll.js) can trigger it.
 * @param {"login"|"signup"|"forgot"} mode
 */
window.MH_openAuthModal = function (mode) {
  window.MH._authMode = mode;
  window.MH_updateAuthModalMode();
  const authError = document.getElementById("authError");
  if (authError) authError.classList.add("hidden");
  document.getElementById("authModal")?.classList.remove("hidden");
};

/**
 * Updates the auth modal UI to reflect the current authMode.
 */
window.MH_updateAuthModalMode = function () {
  const authMode = window.MH._authMode;
  const displayNameGroup = document.getElementById("displayNameGroup");
  const passwordInput = document.getElementById("authPassword");
  const passwordGroup = passwordInput?.closest(".auth-input-group");
  const forgotPasswordWrap = document.getElementById("forgotPasswordWrap");
  const authTitle = document.getElementById("authTitle");
  const authSubmitBtn = document.getElementById("authSubmitBtn");
  const authError = document.getElementById("authError");
  const authSwitchText = document.getElementById("authSwitchText");
  const authSwitchBtn = document.getElementById("authSwitchBtn");

  if (authMode === "login") {
    authTitle.textContent = "Sign In";
    authSubmitBtn.textContent = "Sign In";
    if (displayNameGroup) displayNameGroup.classList.add("hidden");
    if (passwordGroup) passwordGroup.classList.remove("hidden");
    if (forgotPasswordWrap) forgotPasswordWrap.classList.remove("hidden");
    if (passwordInput) passwordInput.required = true;
    if (authSwitchText) authSwitchText.textContent = "Don't have an account?";
    if (authSwitchBtn) authSwitchBtn.textContent = "Sign Up";
  } else if (authMode === "signup") {
    authTitle.textContent = "Sign Up";
    authSubmitBtn.textContent = "Sign Up";
    if (displayNameGroup) displayNameGroup.classList.remove("hidden");
    if (passwordGroup) passwordGroup.classList.remove("hidden");
    if (forgotPasswordWrap) forgotPasswordWrap.classList.add("hidden");
    if (passwordInput) passwordInput.required = true;
    if (authSwitchText)
      authSwitchText.textContent = "Already have an account?";
    if (authSwitchBtn) authSwitchBtn.textContent = "Sign In";
  } else if (authMode === "forgot") {
    authTitle.textContent = "Reset Password";
    authSubmitBtn.textContent = "Send reset email";
    if (displayNameGroup) displayNameGroup.classList.add("hidden");
    if (passwordGroup) passwordGroup.classList.add("hidden");
    if (forgotPasswordWrap) forgotPasswordWrap.classList.add("hidden");
    if (passwordInput) passwordInput.required = false;
    if (authSwitchText)
      authSwitchText.textContent = "Remember your password?";
    if (authSwitchBtn) authSwitchBtn.textContent = "Sign In";
  }
  if (authError) authError.classList.add("hidden");
};

/**
 * Initializes all auth-related event listeners and UI.
 * @param {object} supabase - The Supabase client instance.
 */
window.MH_initAuth = function (supabase) {
  window.MH._authMode = "login";

  // Registered once — closes the user dropdown when clicking anywhere outside it.
  // Uses AbortController so the old listener is removed if auth state changes.
  let _dropdownListenerController = null;

  const authModal = document.getElementById("authModal");
  const loginBtn = document.getElementById("loginBtn");
  const closeAuthModal = document.getElementById("closeAuthModal");
  const authForm = document.getElementById("authForm");
  const authSwitchBtn = document.getElementById("authSwitchBtn");

  // Auth mode switch button
  if (authSwitchBtn) {
    authSwitchBtn.addEventListener("click", () => {
      if (window.MH._authMode === "login") {
        window.MH._authMode = "signup";
      } else {
        window.MH._authMode = "login";
      }
      window.MH_updateAuthModalMode();
    });
  }

  // Forgot password button
  const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
  if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener("click", () => {
      window.MH._authMode = "forgot";
      window.MH_updateAuthModalMode();
    });
  }

  // Open modal buttons
  if (loginBtn)
    loginBtn.addEventListener("click", () => window.MH_openAuthModal("login"));
  if (closeAuthModal)
    closeAuthModal.addEventListener("click", () =>
      authModal.classList.add("hidden"),
    );

  // Auth form submission
  if (authForm) {
    authForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const authError = document.getElementById("authError");
      const authSubmitBtn = document.getElementById("authSubmitBtn");
      const authMode = window.MH._authMode;

      authError.classList.add("hidden");
      authError.classList.remove("text-success"); // Reset to default error color before each attempt
      authSubmitBtn.disabled = true;
      authSubmitBtn.textContent = "Please wait...";

      const email = document.getElementById("authEmail").value;
      const password = document.getElementById("authPassword").value;

      let error = null;
      if (authMode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        error = signInError;
      } else if (authMode === "signup") {
        const displayName =
          document.getElementById("authDisplayName")?.value || "";
        const { data: signUpData, error: signUpError } =
          await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { display_name: displayName },
            },
          });
        error = signUpError;
        if (!error && signUpData && !signUpData.session) {
          window.handleSignupConfirmation(
            authError,
            email,
            authSubmitBtn,
            supabase,
          );
          return;
        }
      } else if (authMode === "forgot") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          email,
          {
            redirectTo: window.location.origin + "/profile",
          },
        );
        error = resetError;
        if (!error) {
          alert("Password reset email sent! Check your inbox.");
          authModal.classList.add("hidden");
        }
      }

      if (error) {
        console.error("Auth Error:", error);
        // Friendlier message for unconfirmed email
        if (error.message === "Email not confirmed") {
          window.handleUnconfirmedEmail(authError, "authEmail", supabase);
        } else {
          authError.textContent = error.message;
          authError.classList.remove("hidden");
        }
      } else if (authMode !== "forgot") {
        authModal.classList.add("hidden");
      }
      authSubmitBtn.disabled = false;
      authSubmitBtn.textContent =
        authMode === "login"
          ? "Sign In"
          : authMode === "signup"
            ? "Sign Up"
            : "Send reset email";
    });
  }

  /**
   * Updates the #authSection in the header based on login state.
   * Shows the user menu when logged in and a sign-in button when logged out.
   */
  function updateAuthUI() {
    const authSection = document.getElementById("authSection");
    const currentUser = window.MH.currentUser;

    if (currentUser) {
      const displayName =
        currentUser.user_metadata?.display_name ||
        currentUser.email?.split("@")[0] ||
        "User";
      const initials = displayName[0].toUpperCase();
      const safeDisplayName = window.escapeHtml(displayName);
      const safeEmail = window.escapeHtml(currentUser.email || "");
      authSection.innerHTML = `
        <div class="user-menu-wrap">
          <button id="userMenuBtn" class="user-menu-btn">
            <div class="user-menu-avatar">${initials}</div>
            <span>${safeDisplayName}</span>
            <i class="fas fa-chevron-down user-menu-chevron"></i>
          </button>
          <div id="userDropdown" class="user-dropdown hidden">
            <div class="user-dropdown-header">Signed in as<br><strong class="user-dropdown-email">${safeEmail}</strong></div>
            <a href="profile" class="user-dropdown-link"><i class="fas fa-user user-dropdown-icon"></i> Your Profile</a>
            <div class="user-dropdown-divider">
              <button id="logoutBtn" class="user-dropdown-btn"><i class="fas fa-sign-out-alt user-dropdown-icon"></i> Sign out</button>
            </div>
          </div>
        </div>
      `;
      document.getElementById("userMenuBtn").addEventListener("click", (e) => {
        e.stopPropagation();
        document.getElementById("userDropdown").classList.toggle("hidden");
      });

      // Remove any previous document-level listener before adding a new one
      if (_dropdownListenerController) _dropdownListenerController.abort();
      _dropdownListenerController = new AbortController();
      document.addEventListener(
        "click",
        () => {
          const dd = document.getElementById("userDropdown");
          if (dd) dd.classList.add("hidden");
        },
        { signal: _dropdownListenerController.signal },
      );

      document
        .getElementById("logoutBtn")
        .addEventListener("click", async () => {
          await supabase.auth.signOut();
        });
    } else {
      authSection.innerHTML = `
        <button id="loginBtn" class="btn-primary auth-btn-small">Sign in</button>
      `;
      document
        .getElementById("loginBtn")
        .addEventListener("click", () => window.MH_openAuthModal("login"));
    }
  }

  // Re-render UI and poll widget on every auth state change (login, logout, token refresh)
  supabase.auth.onAuthStateChange((event, session) => {
    window.MH.currentUser = session?.user || null;
    updateAuthUI();
    window.MH_initPollWidget(supabase);
  });
};
