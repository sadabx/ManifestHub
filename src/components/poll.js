// =============================================================
// poll.js — Community Poll Widget
// =============================================================
// Fetches the active poll from Supabase, checks if the current
// user has voted, and renders either the voting or results view.
// Re-called on every auth state change.
// =============================================================

/**
 * Initializes the community poll widget.
 * @param {object} supabase - The Supabase client instance.
 */
window.MH_initPollWidget = async function (supabase) {
  const pollCard = document.getElementById("pollCard");
  const pollQuestionText = document.getElementById("pollQuestionText");
  const pollVoteInterface = document.getElementById("pollVoteInterface");
  const pollOptionsContainer = document.getElementById("pollOptionsContainer");
  const pollAuthWarning = document.getElementById("pollAuthWarning");
  const pollLoginBtn = document.getElementById("pollLoginBtn");
  const pollResultsInterface = document.getElementById("pollResultsInterface");
  const pollResultsContainer = document.getElementById("pollResultsContainer");
  const pollTotalVotes = document.getElementById("pollTotalVotes");
  const pollVoteReceipt = document.getElementById("pollVoteReceipt");

  if (!pollCard) return;

  const currentUser = window.MH.currentUser;
  const pollMinimizeBtn = document.getElementById("pollMinimizeBtn");
  const pollBody = document.getElementById("pollBody");

  // Load and apply the minimize state immediately to prevent layout flickering
  if (pollMinimizeBtn && pollBody) {
    const isMinimized = localStorage.getItem("MH_poll_minimized") === "true";
    if (isMinimized) {
      pollCard.classList.add("minimized");
      pollBody.classList.add("collapsed");
    } else {
      pollCard.classList.remove("minimized");
      pollBody.classList.remove("collapsed");
    }

    // Bind toggle click handler
    pollMinimizeBtn.onclick = (e) => {
      e.preventDefault();
      const currentlyMinimized = pollCard.classList.toggle("minimized");
      pollBody.classList.toggle("collapsed");
      localStorage.setItem("MH_poll_minimized", currentlyMinimized);
    };
  }

  try {
    // 1. Fetch the active poll from Supabase
    const { data: activePoll, error: pollError } = await supabase
      .from("polls")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pollError) {
      console.warn("Failed to fetch active poll from Supabase:", pollError);
      pollCard.classList.add("hidden");
      return;
    }

    if (!activePoll) {
      pollCard.classList.add("hidden");
      return;
    }

    // 2. Fetch all votes for this active poll to calculate totals
    const { data: votesData, error: votesError } = await supabase
      .from("poll_votes")
      .select("vote_option")
      .eq("poll_id", activePoll.id);

    if (votesError) {
      console.warn("Failed to fetch poll votes:", votesError);
    }

    // Map votes in memory
    const votesMap = {};
    activePoll.options.forEach((opt) => (votesMap[opt] = 0));
    if (votesData) {
      votesData.forEach((v) => {
        votesMap[v.vote_option] = (votesMap[v.vote_option] || 0) + 1;
      });
    }

    // 3. Check if the current user has already voted on this poll
    let userVotedOption = null;
    if (currentUser) {
      const { data: userVoteData, error: userVoteError } = await supabase
        .from("poll_votes")
        .select("vote_option")
        .eq("poll_id", activePoll.id)
        .eq("user_id", currentUser.id)
        .maybeSingle();

      if (!userVoteError && userVoteData) {
        userVotedOption = userVoteData.vote_option;
      }
    }

    // Render active poll UI
    pollCard.classList.remove("hidden");
    pollQuestionText.textContent = activePoll.question;

    if (userVotedOption) {
      renderPollResults(activePoll, votesMap, userVotedOption);
    } else {
      renderPollVoting(activePoll);
    }

    // Setup sign-in warning trigger
    if (pollLoginBtn) {
      pollLoginBtn.onclick = (e) => {
        e.preventDefault();
        if (typeof window.MH_openAuthModal === "function") {
          window.MH_openAuthModal("login");
        }
      };
    }

    function renderPollVoting(poll) {
      pollVoteInterface.classList.remove("hidden");
      pollResultsInterface.classList.add("hidden");
      pollOptionsContainer.innerHTML = "";

      // Show login warning if guest
      if (!currentUser) {
        pollAuthWarning.classList.remove("hidden");
      } else {
        pollAuthWarning.classList.add("hidden");
      }

      poll.options.forEach((option) => {
        const btn = document.createElement("button");
        btn.className = "poll-option-btn";
        btn.textContent = option;
        btn.disabled = !currentUser; // disabled for guests
        btn.onclick = () => castVote(poll.id, option);
        pollOptionsContainer.appendChild(btn);
      });
    }

    function renderPollResults(poll, vMap, userVotedOpt) {
      pollVoteInterface.classList.add("hidden");
      pollResultsInterface.classList.remove("hidden");
      pollResultsContainer.innerHTML = "";

      // Hide total votes count element
      pollTotalVotes.textContent = "";
      pollTotalVotes.style.display = "none";

      if (userVotedOpt) {
        pollVoteReceipt.textContent = `You voted: ${userVotedOpt}`;
      } else {
        pollVoteReceipt.textContent = "";
      }

      const total = Object.values(vMap).reduce(
        (sum, count) => sum + count,
        0,
      );

      // Create segmented bar container
      const barContainer = document.createElement("div");
      barContainer.style.display = "flex";
      barContainer.style.width = "100%";
      barContainer.style.height = "10px";
      barContainer.style.borderRadius = "5px";
      barContainer.style.overflow = "hidden";
      barContainer.style.background = "#21262d";
      barContainer.style.marginTop = "0.75rem";
      barContainer.style.marginBottom = "1rem";

      // Create legend container
      const legendContainer = document.createElement("div");
      legendContainer.style.display = "flex";
      legendContainer.style.flexWrap = "wrap";
      legendContainer.style.gap = "0.75rem 1.25rem";
      legendContainer.style.marginTop = "0.5rem";

      const colors = [
        "#58a6ff", // Blue
        "#d29922", // Yellow
        "#a371f7", // Purple
        "#ff7b72", // Coral/Salmon
        "#79c0ff", // Light Blue
        "#56d364"  // Green
      ];

      poll.options.forEach((option, idx) => {
        const count = vMap[option] || 0;
        const percent = total > 0 ? Math.round((count / total) * 100) : 0;
        const color = colors[idx % colors.length];

        // 1. Add segment to the bar if percentage > 0
        if (percent > 0) {
          const segment = document.createElement("div");
          segment.style.height = "100%";
          segment.style.backgroundColor = color;
          segment.style.width = "0%";
          segment.style.transition = "width 0.8s cubic-bezier(0.4, 0, 0.2, 1)";
          barContainer.appendChild(segment);

          // Animate the segment width
          setTimeout(() => {
            segment.style.width = `${percent}%`;
          }, 50);
        }

        // 2. Add legend item
        const legendItem = document.createElement("div");
        legendItem.style.display = "flex";
        legendItem.style.alignItems = "center";
        legendItem.style.gap = "0.4rem";
        legendItem.style.fontSize = "0.85rem";
        legendItem.style.color = "#c9d1d9";

        const dot = document.createElement("span");
        dot.style.width = "8px";
        dot.style.height = "8px";
        dot.style.borderRadius = "50%";
        dot.style.backgroundColor = color;

        const textSpan = document.createElement("span");
        textSpan.textContent = option;

        const pctStrong = document.createElement("strong");
        pctStrong.style.color = "#8b949e";
        pctStrong.style.marginLeft = "2px";
        pctStrong.textContent = `${percent}%`;

        legendItem.appendChild(dot);
        legendItem.appendChild(textSpan);
        legendItem.appendChild(pctStrong);

        legendContainer.appendChild(legendItem);
      });

      pollResultsContainer.appendChild(barContainer);
      pollResultsContainer.appendChild(legendContainer);
    }

    async function castVote(pollId, option) {
      if (!currentUser) return;

      // 1. Submit vote to Supabase
      const { error: castError } = await supabase
        .from("poll_votes")
        .insert([
          { poll_id: pollId, user_id: currentUser.id, vote_option: option },
        ]);

      if (castError) {
        console.error("Failed to cast vote in Supabase:", castError);
        if (typeof showToast === "function") {
          showToast("Failed to cast vote: " + castError.message, "error");
        }
        return;
      }

      if (typeof showToast === "function") {
        showToast(`Vote cast for: ${option}!`, "success");
      }

      // 2. Re-initialize widget to fetch latest counts and display results
      window.MH_initPollWidget(supabase);
    }
  } catch (err) {
    console.error("Error initializing poll widget:", err);
    pollCard.classList.add("hidden");
  }
};
