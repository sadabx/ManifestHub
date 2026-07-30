(function () {
  "use strict";

  const CATEGORIES = {
    general: "General",
    features: "Feature requests",
    bugs: "Bug reports",
    qa: "Q & A",
    tips: "Tips & tricks",
  };

  const state = {
    posts: [],
    replies: [],
    profiles: new Map(),
    adminIds: new Set(),
    postVotes: new Map(),
    replyVotes: new Map(),
    expandedPosts: new Set(),
    currentUser: null,
    isAdmin: false,
    category: "all",
    sort: "hot",
    search: "",
    loading: true,
  };

  const client = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY,
  );

  const elements = {
    auth: document.getElementById("forumAuth"),
    newPost: document.getElementById("newPostButton"),
    search: document.getElementById("forumSearch"),
    sort: document.querySelector(".forum-sort"),
    categories: document.getElementById("categoryList"),
    status: document.getElementById("forumStatus"),
    posts: document.getElementById("postsContainer"),
    empty: document.getElementById("emptyState"),
    modal: document.getElementById("postModal"),
    closeModal: document.getElementById("closePostModal"),
    cancelModal: document.getElementById("cancelPostModal"),
    form: document.getElementById("postForm"),
    category: document.getElementById("postCategory"),
    title: document.getElementById("postTitle"),
    content: document.getElementById("postContent"),
    formError: document.getElementById("postFormError"),
    submit: document.getElementById("submitPostButton"),
    toast: document.getElementById("forumToast"),
  };

  let toastTimer = null;
  let accountMenuController = null;

  function escape(value) {
    return window.escapeHtml(value == null ? "" : String(value));
  }

  function displayName(user) {
    return (
      user?.user_metadata?.display_name ||
      user?.email?.split("@")[0] ||
      "Member"
    );
  }

  function relativeTime(value) {
    const timestamp = new Date(value).getTime();
    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (seconds < 45) return "just now";
    const units = [
      [31536000, "year"],
      [2592000, "month"],
      [604800, "week"],
      [86400, "day"],
      [3600, "hour"],
      [60, "minute"],
    ];
    for (const [size, label] of units) {
      if (seconds >= size) {
        const amount = Math.floor(seconds / size);
        return `${amount} ${label}${amount === 1 ? "" : "s"} ago`;
      }
    }
    return "just now";
  }

  function showToast(message, type = "success") {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle("is-error", type === "error");
    elements.toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 3500);
  }

  function showStatus(message, isError = false) {
    elements.status.innerHTML = isError
      ? `<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ${escape(message)}`
      : `<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> ${escape(message)}`;
    elements.status.hidden = false;
    elements.posts.hidden = true;
    elements.empty.hidden = true;
  }

  function requireAuth() {
    if (state.currentUser) return true;
    window.location.href = "../?auth=login&returnTo=/forum/";
    return false;
  }

  function renderAuth() {
    if (accountMenuController) {
      accountMenuController.abort();
      accountMenuController = null;
    }

    if (!state.currentUser) {
      elements.auth.innerHTML =
        '<a class="forum-sign-in" href="../?auth=login&amp;returnTo=/forum/">Sign in</a>';
      return;
    }

    const name = displayName(state.currentUser);
    elements.auth.innerHTML = `
      <div class="user-menu-wrap">
        <button class="user-menu-btn" id="forumUserMenuButton" type="button"
          aria-haspopup="true" aria-expanded="false">
          <span class="user-menu-avatar">${escape(name.charAt(0).toUpperCase())}</span>
          <span>${escape(name)}</span>
          <i class="fas fa-chevron-down user-menu-chevron" aria-hidden="true"></i>
        </button>
        <div class="user-dropdown hidden" id="forumUserDropdown">
          <div class="user-dropdown-header">
            Signed in as<br>
            <strong class="user-dropdown-email">${escape(state.currentUser.email || "")}</strong>
          </div>
          <a href="/profile/" class="user-dropdown-link">
            <i class="fas fa-user user-dropdown-icon" aria-hidden="true"></i>
            Your Profile
          </a>
          <div class="user-dropdown-divider">
            <button class="user-dropdown-btn" id="forumLogoutButton" type="button">
              <i class="fas fa-sign-out-alt user-dropdown-icon" aria-hidden="true"></i>
              Sign out
            </button>
          </div>
        </div>
      </div>`;

    const menuButton = document.getElementById("forumUserMenuButton");
    const dropdown = document.getElementById("forumUserDropdown");
    const logoutButton = document.getElementById("forumLogoutButton");
    const setOpen = (open) => {
      dropdown.classList.toggle("hidden", !open);
      menuButton.setAttribute("aria-expanded", String(open));
    };

    menuButton.addEventListener("click", (event) => {
      event.stopPropagation();
      setOpen(dropdown.classList.contains("hidden"));
    });
    logoutButton.addEventListener("click", async () => {
      setOpen(false);
      await client.auth.signOut();
    });

    accountMenuController = new AbortController();
    document.addEventListener("click", () => setOpen(false), {
      signal: accountMenuController.signal,
    });
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") setOpen(false);
      },
      { signal: accountMenuController.signal },
    );
  }

  function replyCount(postId) {
    return state.replies.filter((reply) => reply.post_id === postId).length;
  }

  function getFilteredPosts() {
    const query = state.search.trim().toLowerCase();
    const filtered = state.posts.filter((post) => {
      const categoryMatch =
        state.category === "all" || post.category === state.category;
      const author = state.profiles.get(post.author_id) || "Member";
      const searchMatch =
        !query ||
        post.title.toLowerCase().includes(query) ||
        post.content.toLowerCase().includes(query) ||
        author.toLowerCase().includes(query);
      return categoryMatch && searchMatch;
    });

    return filtered.sort((a, b) => {
      if (state.sort === "new") {
        return new Date(b.created_at) - new Date(a.created_at);
      }
      if (state.sort === "top") return b.score - a.score;
      if (state.sort === "discussed") {
        return replyCount(b.id) - replyCount(a.id);
      }
      return b.score + replyCount(b.id) * 3 - (a.score + replyCount(a.id) * 3);
    });
  }

  function updateCategoryCounts() {
    const counts = { all: state.posts.length };
    Object.keys(CATEGORIES).forEach((category) => {
      counts[category] = state.posts.filter(
        (post) => post.category === category,
      ).length;
    });
    Object.entries(counts).forEach(([category, count]) => {
      const target = document.querySelector(
        `[data-category-count="${category}"]`,
      );
      if (target) target.textContent = String(count);
    });
  }

  function renderReply(reply, depth = 0) {
    const name = state.profiles.get(reply.author_id) || "Member";
    const isAdminAuthor = state.adminIds.has(reply.author_id);
    const canDelete =
      state.currentUser?.id === reply.author_id || state.isAdmin;
    const vote = state.replyVotes.get(reply.id) || 0;
    const children = state.replies.filter(
      (candidate) => candidate.parent_id === reply.id,
    );
    const canNest = depth === 0;

    return `
      <article class="reply-item${depth ? " is-nested" : ""}" id="reply-${reply.id}">
        <div class="reply-meta">
          <span class="reply-author${isAdminAuthor ? " is-admin" : ""}">${escape(name)}${isAdminAuthor ? ' <i class="fa-solid fa-shield-halved admin-mark" title="Administrator" aria-label="Administrator"></i>' : ""}</span>
          <time datetime="${escape(reply.created_at)}">${escape(relativeTime(reply.created_at))}</time>
        </div>
        <p class="reply-content">${escape(reply.content)}</p>
        <div class="reply-actions">
          <button class="reply-action${vote === 1 ? " is-up" : ""}" type="button"
            data-action="vote-reply" data-reply-id="${reply.id}" data-value="1" aria-label="Upvote reply">
            <i class="fa-solid fa-angle-up" aria-hidden="true"></i>
          </button>
          <span class="reply-score">${reply.score}</span>
          <button class="reply-action${vote === -1 ? " is-down" : ""}" type="button"
            data-action="vote-reply" data-reply-id="${reply.id}" data-value="-1" aria-label="Downvote reply">
            <i class="fa-solid fa-angle-down" aria-hidden="true"></i>
          </button>
          ${canNest ? `
            <button class="reply-action" type="button" data-action="show-reply-form"
              data-post-id="${reply.post_id}" data-parent-id="${reply.id}">
              <i class="fa-solid fa-reply" aria-hidden="true"></i> Reply
            </button>` : ""}
          ${canDelete ? `
            <button class="reply-action is-danger" type="button" data-action="delete-reply"
              data-reply-id="${reply.id}" data-post-id="${reply.post_id}">
              <i class="fa-regular fa-trash-can" aria-hidden="true"></i> Delete
            </button>` : ""}
        </div>
        ${canNest ? renderReplyForm(reply.post_id, reply.id) : ""}
        ${children.map((child) => renderReply(child, depth + 1)).join("")}
      </article>`;
  }

  function renderReplyForm(postId, parentId = "") {
    const suffix = parentId || "post";
    return `
      <form class="reply-form" data-reply-form="${postId}-${suffix}" data-post-id="${postId}"
        data-parent-id="${parentId}" hidden>
        <textarea maxlength="5000" required placeholder="Write a reply"></textarea>
        <div class="reply-form-actions">
          <button class="forum-button forum-button-primary" type="submit">Post reply</button>
        </div>
      </form>`;
  }

  function renderPost(post) {
    const name = state.profiles.get(post.author_id) || "Member";
    const isAdminAuthor = state.adminIds.has(post.author_id);
    const replies = state.replies.filter(
      (reply) => reply.post_id === post.id && reply.parent_id === null,
    );
    const totalReplies = replyCount(post.id);
    const vote = state.postVotes.get(post.id) || 0;
    const expanded = state.expandedPosts.has(post.id);
    const canDelete = state.currentUser?.id === post.author_id || state.isAdmin;

    return `
      <article class="post-card${expanded ? " is-expanded" : ""}" id="post-${post.id}" data-post-id="${post.id}">
        <div class="post-vote">
          <button class="vote-button${vote === 1 ? " is-up" : ""}" type="button"
            data-action="vote-post" data-post-id="${post.id}" data-value="1" aria-label="Upvote post">
            <i class="fa-solid fa-angle-up" aria-hidden="true"></i>
          </button>
          <span class="vote-score">${post.score}</span>
          <button class="vote-button${vote === -1 ? " is-down" : ""}" type="button"
            data-action="vote-post" data-post-id="${post.id}" data-value="-1" aria-label="Downvote post">
            <i class="fa-solid fa-angle-down" aria-hidden="true"></i>
          </button>
        </div>
        <div class="post-main">
          <div class="post-meta">
            <span class="post-category">${escape(CATEGORIES[post.category] || post.category)}</span>
            <span class="post-author${isAdminAuthor ? " is-admin" : ""}">${escape(name)}${isAdminAuthor ? ' <i class="fa-solid fa-shield-halved admin-mark" title="Administrator" aria-label="Administrator"></i>' : ""}</span>
            <time datetime="${escape(post.created_at)}">${escape(relativeTime(post.created_at))}</time>
          </div>
          <button class="post-title-button" type="button" data-action="toggle-post" data-post-id="${post.id}">
            ${escape(post.title)}
          </button>
          <p class="post-preview">${escape(post.content)}</p>
          <p class="post-content">${escape(post.content)}</p>
          <div class="post-actions">
            <button class="post-action" type="button" data-action="toggle-post" data-post-id="${post.id}">
              <i class="fa-regular fa-comment" aria-hidden="true"></i>
              ${totalReplies} ${totalReplies === 1 ? "reply" : "replies"}
            </button>
            ${post.locked ? "" : `
              <button class="post-action" type="button" data-action="show-reply-form" data-post-id="${post.id}">
                <i class="fa-solid fa-reply" aria-hidden="true"></i> Reply
              </button>`}
            <button class="post-action" type="button" data-action="share-post" data-post-id="${post.id}">
              <i class="fa-solid fa-link" aria-hidden="true"></i> Share
            </button>
            ${canDelete ? `
              <button class="post-action is-danger" type="button" data-action="delete-post" data-post-id="${post.id}">
                <i class="fa-regular fa-trash-can" aria-hidden="true"></i> Delete
              </button>` : ""}
          </div>
          <section class="replies" aria-label="Replies">
            <div class="reply-list">${replies.map((reply) => renderReply(reply)).join("")}</div>
            ${post.locked ? '<p class="forum-sidebar-note">This discussion is locked.</p>' : renderReplyForm(post.id)}
          </section>
        </div>
      </article>`;
  }

  function renderPosts() {
    if (state.loading) return;
    updateCategoryCounts();
    const posts = getFilteredPosts();
    elements.status.hidden = true;
    elements.posts.hidden = posts.length === 0;
    elements.empty.hidden = posts.length !== 0;
    elements.posts.innerHTML = posts.map(renderPost).join("");
  }

  async function loadVotes() {
    state.postVotes.clear();
    state.replyVotes.clear();
    if (!state.currentUser) return;

    const [postResult, replyResult] = await Promise.all([
      client
        .from("forum_post_votes")
        .select("post_id,value")
        .eq("user_id", state.currentUser.id),
      client
        .from("forum_reply_votes")
        .select("reply_id,value")
        .eq("user_id", state.currentUser.id),
    ]);

    if (!postResult.error) {
      postResult.data.forEach((vote) =>
        state.postVotes.set(vote.post_id, vote.value),
      );
    }
    if (!replyResult.error) {
      replyResult.data.forEach((vote) =>
        state.replyVotes.set(vote.reply_id, vote.value),
      );
    }
  }

  async function loadAdminState(authorIds) {
    state.adminIds.clear();
    state.isAdmin = false;

    const requests = [
      authorIds.length
        ? client.rpc("get_forum_admin_ids", { candidate_ids: authorIds })
        : Promise.resolve({ data: [], error: null }),
      state.currentUser
        ? client.rpc("is_forum_admin")
        : Promise.resolve({ data: false, error: null }),
    ];
    const [authorsResult, currentUserResult] = await Promise.all(requests);

    if (!authorsResult.error) {
      (authorsResult.data || []).forEach((admin) =>
        state.adminIds.add(admin.user_id),
      );
    } else {
      console.error("Forum admin labels failed:", authorsResult.error);
    }

    if (!currentUserResult.error) {
      state.isAdmin = currentUserResult.data === true;
    } else {
      console.error("Forum admin check failed:", currentUserResult.error);
    }
  }

  async function loadForum() {
    state.loading = true;
    showStatus("Loading discussions...");

    const postResult = await client
      .from("forum_posts")
      .select("id,author_id,category,title,content,score,locked,created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (postResult.error) {
      state.loading = false;
      const missingSchema =
        postResult.error.code === "42P01" || postResult.error.code === "PGRST205";
      showStatus(
        missingSchema
          ? "The forum database has not been configured yet."
          : "Could not load discussions. Please try again later.",
        true,
      );
      console.error("Forum posts failed:", postResult.error);
      return;
    }

    state.posts = postResult.data || [];
    const postIds = state.posts.map((post) => post.id);
    let replies = [];

    if (postIds.length) {
      const replyResult = await client
        .from("forum_replies")
        .select("id,post_id,parent_id,author_id,content,score,created_at")
        .in("post_id", postIds)
        .order("created_at", { ascending: true })
        .limit(1000);
      if (replyResult.error) {
        state.loading = false;
        showStatus("Could not load replies. Please try again later.", true);
        console.error("Forum replies failed:", replyResult.error);
        return;
      }
      replies = replyResult.data || [];
    }

    state.replies = replies;
    const authorIds = [
      ...new Set([
        ...state.posts.map((post) => post.author_id),
        ...state.replies.map((reply) => reply.author_id),
      ]),
    ];

    state.profiles.clear();
    if (authorIds.length) {
      const profileResult = await client
        .from("forum_profiles")
        .select("id,display_name")
        .in("id", authorIds);
      if (!profileResult.error) {
        profileResult.data.forEach((profile) =>
          state.profiles.set(profile.id, profile.display_name),
        );
      }
    }

    await loadAdminState(authorIds);
    await loadVotes();
    state.loading = false;

    const requestedPost = Number(
      new URLSearchParams(window.location.search).get("post"),
    );
    if (requestedPost && state.posts.some((post) => post.id === requestedPost)) {
      state.expandedPosts.add(requestedPost);
    }

    renderPosts();
    if (requestedPost) {
      document.getElementById(`post-${requestedPost}`)?.scrollIntoView({
        block: "center",
      });
    }
  }

  function openPostModal() {
    if (!requireAuth()) return;
    elements.form.reset();
    elements.formError.hidden = true;
    elements.modal.hidden = false;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => elements.title.focus(), 50);
  }

  function closePostModal() {
    elements.modal.hidden = true;
    document.body.style.overflow = "";
  }

  async function createPost(event) {
    event.preventDefault();
    if (!requireAuth()) return;
    if (!elements.form.reportValidity()) return;

    elements.submit.disabled = true;
    elements.submit.textContent = "Publishing...";
    elements.formError.hidden = true;

    const result = await client.from("forum_posts").insert({
      author_id: state.currentUser.id,
      category: elements.category.value,
      title: elements.title.value.trim(),
      content: elements.content.value.trim(),
    });

    elements.submit.disabled = false;
    elements.submit.textContent = "Publish post";
    if (result.error) {
      elements.formError.textContent = result.error.message;
      elements.formError.hidden = false;
      return;
    }

    closePostModal();
    state.category = "all";
    state.sort = "new";
    updateActiveControls();
    await loadForum();
    showToast("Post published.");
  }

  async function createReply(form) {
    if (!requireAuth()) return;
    const textarea = form.querySelector("textarea");
    const content = textarea.value.trim();
    if (!content) return;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "Posting...";

    const parentId = Number(form.dataset.parentId) || null;
    const result = await client.from("forum_replies").insert({
      post_id: Number(form.dataset.postId),
      parent_id: parentId,
      author_id: state.currentUser.id,
      content,
    });

    if (result.error) {
      button.disabled = false;
      button.textContent = "Post reply";
      showToast(result.error.message, "error");
      return;
    }

    await loadForum();
    state.expandedPosts.add(Number(form.dataset.postId));
    renderPosts();
    showToast("Reply posted.");
  }

  async function vote(kind, id, value) {
    if (!requireAuth()) return;
    const isPost = kind === "post";
    const table = isPost ? "forum_post_votes" : "forum_reply_votes";
    const key = isPost ? "post_id" : "reply_id";
    const votes = isPost ? state.postVotes : state.replyVotes;
    const existing = votes.get(id) || 0;
    let result;

    if (existing === value) {
      result = await client
        .from(table)
        .delete()
        .eq(key, id)
        .eq("user_id", state.currentUser.id);
    } else if (existing) {
      result = await client
        .from(table)
        .update({ value })
        .eq(key, id)
        .eq("user_id", state.currentUser.id);
    } else {
      result = await client
        .from(table)
        .insert({ [key]: id, user_id: state.currentUser.id, value });
    }

    if (result.error) {
      showToast("Vote could not be saved.", "error");
      return;
    }

    const next = existing === value ? 0 : value;
    const collection = isPost ? state.posts : state.replies;
    const target = collection.find((item) => item.id === id);
    if (target) target.score += next - existing;
    if (next) votes.set(id, next);
    else votes.delete(id);
    renderPosts();
  }

  async function sharePost(postId) {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("post", postId);
    try {
      await navigator.clipboard.writeText(url.toString());
      showToast("Discussion link copied.");
    } catch (error) {
      window.history.replaceState({}, "", url);
      showToast("Link added to the address bar.");
    }
  }

  function showReplyForm(postId, parentId = "post") {
    state.expandedPosts.add(postId);
    renderPosts();

    const form = elements.posts.querySelector(
      `[data-reply-form="${postId}-${parentId}"]`,
    );
    if (!form) return;
    form.hidden = false;
    form.querySelector("textarea").focus();
  }

  async function deletePost(postId, button) {
    if (!requireAuth()) return;
    const post = state.posts.find((candidate) => candidate.id === postId);
    if (!post || (post.author_id !== state.currentUser.id && !state.isAdmin)) {
      showToast("You do not have permission to delete this post.", "error");
      return;
    }
    if (!window.confirm("Delete this post and all of its replies?")) return;

    button.disabled = true;
    let query = client
      .from("forum_posts")
      .delete()
      .eq("id", postId);
    if (!state.isAdmin) query = query.eq("author_id", state.currentUser.id);
    const result = await query.select("id");

    if (result.error || result.data?.length !== 1) {
      button.disabled = false;
      showToast("Post could not be deleted.", "error");
      return;
    }

    state.expandedPosts.delete(postId);
    const url = new URL(window.location.href);
    if (url.searchParams.get("post") === String(postId)) {
      url.searchParams.delete("post");
      window.history.replaceState({}, "", url);
    }
    await loadForum();
    showToast("Post deleted.");
  }

  async function deleteReply(replyId, postId, button) {
    if (!requireAuth()) return;
    const reply = state.replies.find((candidate) => candidate.id === replyId);
    if (!reply || (reply.author_id !== state.currentUser.id && !state.isAdmin)) {
      showToast("You do not have permission to delete this reply.", "error");
      return;
    }
    if (!window.confirm("Delete this reply?")) return;

    button.disabled = true;
    let query = client.from("forum_replies").delete().eq("id", replyId);
    if (!state.isAdmin) query = query.eq("author_id", state.currentUser.id);
    const result = await query.select("id");

    if (result.error || result.data?.length !== 1) {
      button.disabled = false;
      showToast("Reply could not be deleted.", "error");
      return;
    }

    await loadForum();
    state.expandedPosts.add(postId);
    renderPosts();
    showToast("Reply deleted.");
  }

  function updateActiveControls() {
    elements.categories.querySelectorAll("[data-category]").forEach((button) => {
      button.classList.toggle(
        "is-active",
        button.dataset.category === state.category,
      );
    });
    elements.sort.querySelectorAll("[data-sort]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.sort === state.sort);
    });
  }

  elements.newPost.addEventListener("click", openPostModal);
  elements.closeModal.addEventListener("click", closePostModal);
  elements.cancelModal.addEventListener("click", closePostModal);
  elements.modal.addEventListener("click", (event) => {
    if (event.target === elements.modal) closePostModal();
  });
  elements.form.addEventListener("submit", createPost);
  elements.search.addEventListener("input", (event) => {
    state.search = event.target.value;
    renderPosts();
  });
  elements.categories.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.category = button.dataset.category;
    updateActiveControls();
    renderPosts();
  });
  elements.sort.addEventListener("click", (event) => {
    const button = event.target.closest("[data-sort]");
    if (!button) return;
    state.sort = button.dataset.sort;
    updateActiveControls();
    renderPosts();
  });
  elements.posts.addEventListener("submit", (event) => {
    const form = event.target.closest(".reply-form");
    if (!form) return;
    event.preventDefault();
    createReply(form);
  });
  elements.posts.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    const postId = Number(target.dataset.postId);
    const replyId = Number(target.dataset.replyId);

    if (action === "toggle-post") {
      if (state.expandedPosts.has(postId)) state.expandedPosts.delete(postId);
      else state.expandedPosts.add(postId);
      renderPosts();
    } else if (action === "show-reply-form") {
      if (!requireAuth()) return;
      const parentId = target.dataset.parentId || "post";
      showReplyForm(postId, parentId);
    } else if (action === "vote-post") {
      vote("post", postId, Number(target.dataset.value));
    } else if (action === "vote-reply") {
      vote("reply", replyId, Number(target.dataset.value));
    } else if (action === "share-post") {
      sharePost(postId);
    } else if (action === "delete-post") {
      deletePost(postId, target);
    } else if (action === "delete-reply") {
      deleteReply(replyId, postId, target);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.modal.hidden) closePostModal();
  });

  async function init() {
    window.MH_initPresence(client);

    const sessionResult = await client.auth.getSession();
    state.currentUser = sessionResult.data.session?.user || null;
    renderAuth();

    client.auth.onAuthStateChange(async (_event, session) => {
      state.currentUser = session?.user || null;
      renderAuth();
      const authorIds = [
        ...new Set([
          ...state.posts.map((post) => post.author_id),
          ...state.replies.map((reply) => reply.author_id),
        ]),
      ];
      await loadAdminState(authorIds);
      await loadVotes();
      renderPosts();
    });

    await loadForum();
  }

  init();
})();
