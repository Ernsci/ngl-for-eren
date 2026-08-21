const $ = (sel) => document.querySelector(sel);

const API_BASE = (window.API_BASE || "").replace(/\/+$/, "");

/* ---------- back button ---------- */
const backBtn = $("#back-btn");
if (backBtn) {
  backBtn.addEventListener("click", () => {
    const fallback = backBtn.dataset.fallback || "index.html";
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = fallback;
    }
  });
}

function show(el) {
  el.classList.remove("hidden");
}

function hide(el) {
  el.classList.add("hidden");
}

async function api(url, options) {
  const res = await fetch(API_BASE + url, options);
  let data = {};
  try {
    data = await res.json();
  } catch (e) {}
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function setLetter(el, text) {
  const letter = (text || "?").trim().charAt(0).toUpperCase() || "?";
  el.textContent = letter;
}

function showAvatar(img, letterEl, letter) {
  img.addEventListener("error", () => {
    img.style.display = "none";
    letterEl.style.display = "block";
  });
  img.src = img.dataset.src;
  img.style.display = "block";
  letterEl.style.display = "none";
  setLetter(letterEl, letter);
}

/* ---------- landing: create account ---------- */
const createForm = $("#create-form");
if (createForm) {
  createForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = $("#create-error");
    const btn = createForm.querySelector("button");
    const username = $("#username").value.trim();
    const email = $("#email").value.trim();
    const password = $("#password").value;
    hide(errorEl);
    btn.disabled = true;
    btn.textContent = "Creating...";
    try {
      const data = await api("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      sessionStorage.setItem("adminKey", data.adminKey);
      $("#link").value = data.link;
      const openPage = $("#open-page");
      openPage.href = `send.html?u=${encodeURIComponent(data.username)}`;
      show($("#result"));
      hide(createForm);
    } catch (err) {
      errorEl.textContent = err.message;
      show(errorEl);
    } finally {
      btn.disabled = false;
      btn.textContent = "Create my account";
    }
  });

  $("#copy-btn").addEventListener("click", async () => {
    const input = $("#link");
    try {
      await navigator.clipboard.writeText(input.value);
      $("#copy-btn").textContent = "Copied!";
      setTimeout(() => ($("#copy-btn").textContent = "Copy"), 1500);
    } catch (e) {
      input.select();
      document.execCommand("copy");
    }
  });
}

/* ---------- login page ---------- */
const loginForm = $("#login-form");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = $("#login-error");
    const btn = loginForm.querySelector("button");
    const email = $("#email").value.trim();
    const password = $("#password").value;
    hide(errorEl);
    btn.disabled = true;
    btn.textContent = "Logging in...";
    try {
      const data = await api("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      sessionStorage.setItem("adminKey", data.adminKey);
      window.location.href = "inbox.html";
    } catch (err) {
      errorEl.textContent = err.message;
      show(errorEl);
    } finally {
      btn.disabled = false;
      btn.textContent = "Log in";
    }
  });
}

/* ---------- send page ---------- */
const sendForm = $("#send-form");
if (sendForm) {
  const params = new URLSearchParams(window.location.search);
  const username =
    params.get("u") || window.location.pathname.split("/").pop();
  const typing = $("#typing");
  const sent = $("#sent");

  (async () => {
    try {
      const profile = await api(`/api/profile/${encodeURIComponent(username)}`);
      const name = profile.displayName || profile.username;
      $("#profile-name").textContent = name;
      $("#profile-bio").textContent = profile.bio || "";
      if (profile.avatarUrl) {
        const img = $("#avatar");
        img.dataset.src = profile.avatarUrl;
        showAvatar(img, $("#avatar-letter"), name);
      } else {
        setLetter($("#avatar-letter"), name);
      }
    } catch (e) {
      $("#send-form").remove();
      $(".profile-header").remove();
      $(".prompt").remove();
      sent.classList.remove("hidden");
      $("#sent p").textContent = "This link doesn't exist.";
    }
  })();

  sendForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = $("#send-error");
    const btn = sendForm.querySelector("button");
    const body = $("#message").value.trim();
    hide(errorEl);
    hide(sent);
    btn.disabled = true;
    btn.textContent = "Sending...";
    try {
      await api("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, body }),
      });
      hide(btn);
      hide($("#message"));
      hide($(".prompt"));
      show(typing);
      setTimeout(() => {
        hide(typing);
        show(sent);
      }, 2200);
    } catch (err) {
      errorEl.textContent = err.message;
      show(errorEl);
      btn.disabled = false;
      btn.textContent = "Send";
    }
  });
}

/* ---------- inbox ---------- */
const inboxForm = $("#inbox-form");
if (inboxForm) {
  const messagesEl = $("#messages");
  const badgeEl = $("#unread-badge");
  const bannerEl = $("#notification-banner");
  let lastUnread = 0;

  function setBadge(n) {
    if (n > 0) {
      badgeEl.textContent = n;
      show(badgeEl);
    } else {
      hide(badgeEl);
    }
  }

  function showBanner(text) {
    $("#notification-banner .notification-text").textContent = text;
    show(bannerEl);
  }

  $("#dismiss-banner").addEventListener("click", () => hide(bannerEl));

  async function pollNotifications(key) {
    if (!key) return;
    try {
      const data = await api(`/api/notifications`, {
        headers: { "X-Admin-Key": key },
      });
      setBadge(data.unread);
      if (data.unread > lastUnread) {
        showBanner(
          `You received ${data.unread} new message${data.unread === 1 ? "" : "s"}!`
        );
        lastUnread = data.unread;
      }
    } catch (e) {}
  }

  async function load(key) {
    hide($("#inbox-error"));
    const data = await api(`/api/messages`, {
      headers: { "X-Admin-Key": key },
    });
    lastUnread = data.unread || 0;
    setBadge(lastUnread);
    messagesEl.innerHTML = "";
    show(messagesEl);
    show($("#inbox-links"));
    if (!data.messages.length) {
      messagesEl.innerHTML = '<p class="empty">No messages yet.</p>';
    } else {
      for (const m of data.messages) {
        const wrap = document.createElement("div");
        wrap.className = "msg" + (m.is_read ? "" : " msg-unread");
        const body = document.createElement("p");
        body.textContent = m.body;
        const time = document.createElement("time");
        time.textContent = new Date(m.created_at).toLocaleString();
        const del = document.createElement("button");
        del.className = "del";
        del.textContent = "Delete";
        del.addEventListener("click", async () => {
          await api(`/api/messages/${m.id}`, {
            method: "DELETE",
            headers: { "X-Admin-Key": key },
          });
          wrap.remove();
          if (!messagesEl.children.length) {
            messagesEl.innerHTML = '<p class="empty">No messages yet.</p>';
          }
        });
        wrap.append(body, time, del);
        messagesEl.appendChild(wrap);
      }
      api(`/api/messages/read`, {
        method: "POST",
        headers: { "X-Admin-Key": key },
      }).then(() => {
        setBadge(0);
        lastUnread = 0;
      }).catch(() => {});
    }
  }

  let pollTimer = null;

  inboxForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = $("#inbox-error");
    const btn = inboxForm.querySelector("button");
    const key = $("#admin-key").value.trim();
    hide(errorEl);
    btn.disabled = true;
    btn.textContent = "Loading...";
    try {
      await load(key);
      sessionStorage.setItem("adminKey", key);
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(() => pollNotifications(key), 15000);
    } catch (err) {
      errorEl.textContent = err.message;
      show(errorEl);
    } finally {
      btn.disabled = false;
      btn.textContent = "View messages";
    }
  });

  const saved = sessionStorage.getItem("adminKey");
  if (saved) {
    $("#admin-key").value = saved;
    inboxForm.requestSubmit();
  }

  const logoutLink = $("#logout-link");
  if (logoutLink) {
    logoutLink.addEventListener("click", () => {
      sessionStorage.removeItem("adminKey");
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    });
  }
}

/* ---------- profile edit page ---------- */
const profileForm = $("#profile-form");
if (profileForm) {
  const errorEl = $("#profile-error");
  const avatarImg = $("#avatar-preview");
  const avatarPlaceholder = $("#avatar-placeholder");
  const key = sessionStorage.getItem("adminKey");

  function updatePreview(url) {
    if (url && url.startsWith("http")) {
      avatarImg.dataset.src = url;
      showAvatar(avatarImg, avatarPlaceholder, $("#display-name").value || "?");
    } else {
      avatarImg.style.display = "none";
      avatarPlaceholder.style.display = "block";
      setLetter(avatarPlaceholder, $("#display-name").value);
    }
  }

  $("#avatar-url").addEventListener("input", (e) => updatePreview(e.target.value));
  $("#display-name").addEventListener("input", () => {
    if (!avatarImg.style.display || avatarImg.style.display === "none") {
      setLetter(avatarPlaceholder, $("#display-name").value);
    }
  });

  (async () => {
    if (!key) {
      errorEl.textContent = "No admin key found. Create your link first.";
      show(errorEl);
      return;
    }
    try {
      const me = await api("/api/me", { headers: { "X-Admin-Key": key } });
      $("#display-name").value = me.displayName || "";
      $("#avatar-url").value = me.avatarUrl || "";
      $("#bio").value = me.bio || "";
      $("#account-email").textContent = me.email
        ? `Logged in as ${me.email}`
        : `Account: @${me.username}`;
      setLetter(avatarPlaceholder, me.displayName || me.username);
      updatePreview(me.avatarUrl);
    } catch (err) {
      errorEl.textContent = err.message;
      show(errorEl);
    }
  })();

  profileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hide(errorEl);
    const btn = profileForm.querySelector("button");
    btn.disabled = true;
    btn.textContent = "Saving...";
    try {
      await api("/api/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Key": key,
        },
        body: JSON.stringify({
          displayName: $("#display-name").value,
          avatarUrl: $("#avatar-url").value,
          bio: $("#bio").value,
        }),
      });
      btn.textContent = "Saved!";
      setTimeout(() => (btn.textContent = "Save profile"), 1500);
    } catch (err) {
      errorEl.textContent = err.message;
      show(errorEl);
    } finally {
      btn.disabled = false;
    }
  });
}

/* ---------- in-app update check ---------- */
const isNativeApp =
  typeof window !== "undefined" &&
  window.Capacitor &&
  window.Capacitor.isNativePlatform &&
  window.Capacitor.isNativePlatform();

function openExternal(url) {
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
    return window.Capacitor.Plugins.Browser.open({ url });
  }
  window.open(url, "_blank");
}

function closeApp() {
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    window.Capacitor.Plugins.App.exitApp();
  }
}

function buildUpdateModal(state) {
  const existing = document.getElementById("update-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "update-modal";
  modal.className = "update-modal";

  const card = document.createElement("div");
  card.className = "update-card";

  const title = document.createElement("h3");
  title.className = "update-title";
  const text = document.createElement("p");
  text.className = "update-text";

  const btn = document.createElement("button");
  btn.className = "btn-gradient";

  if (state === "restart") {
    title.textContent = "Update done!";
    text.textContent =
      "The update is installed. Please restart the app to finish.";
    btn.textContent = "Restart the app";
    btn.addEventListener("click", () => {
      closeApp();
      modal.remove();
    });
  } else {
    title.textContent = "New update available";
    text.textContent = "A new version of ERENNGL is ready. Update now?";
    btn.textContent = "Update now";
    btn.addEventListener("click", async () => {
      const url = state.apkUrl;
      try {
        await openExternal(url);
      } catch (e) {
        window.open(url, "_blank");
      }
      localStorage.setItem("ngl_update_restart", "1");
      buildUpdateModal("restart");
    });
  }

  const later = document.createElement("button");
  later.className = "btn-ghost";
  later.textContent = "Later";
  later.addEventListener("click", () => modal.remove());

  card.append(title, text, btn, later);
  modal.appendChild(card);
  document.body.appendChild(modal);
}

async function checkForUpdate() {
  if (localStorage.getItem("ngl_update_restart") === "1") {
    buildUpdateModal("restart");
    localStorage.removeItem("ngl_update_restart");
    return;
  }
  try {
    const data = await api("/api/update");
    if (!data.update) return;
    const current = window.APP_VERSION || "0.0.0";
    if (data.latestVersion !== current) {
      buildUpdateModal({ apkUrl: data.apkUrl });
    }
  } catch (e) {}
}

if (isNativeApp && !$("#send-form")) {
  checkForUpdate();
}