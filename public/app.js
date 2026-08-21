const $ = (sel) => document.querySelector(sel);

function show(el) {
  el.classList.remove("hidden");
}

function hide(el) {
  el.classList.add("hidden");
}

async function api(url, options) {
  const res = await fetch(url, options);
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

/* ---------- landing: create link ---------- */
const createForm = $("#create-form");
if (createForm) {
  createForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = $("#create-error");
    const btn = createForm.querySelector("button");
    const username = $("#username").value.trim();
    hide(errorEl);
    btn.disabled = true;
    btn.textContent = "Creating...";
    try {
      const data = await api("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      sessionStorage.setItem("adminKey", data.adminKey);
      $("#link").value = data.link;
      show($("#result"));
      hide(createForm);
    } catch (err) {
      errorEl.textContent = err.message;
      show(errorEl);
    } finally {
      btn.disabled = false;
      btn.textContent = "Create my link";
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

/* ---------- send page ---------- */
const sendForm = $("#send-form");
if (sendForm) {
  const username = window.location.pathname.split("/").pop();
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

  async function load(key) {
    hide($("#inbox-error"));
    const data = await api(`/api/messages`, {
      headers: { "X-Admin-Key": key },
    });
    messagesEl.innerHTML = "";
    show(messagesEl);
    show($("#inbox-links"));
    if (!data.messages.length) {
      messagesEl.innerHTML = '<p class="empty">No messages yet.</p>';
      return;
    }
    for (const m of data.messages) {
      const wrap = document.createElement("div");
      wrap.className = "msg";
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
  }

  const saved = sessionStorage.getItem("adminKey");
  if (saved) {
    $("#admin-key").value = saved;
    inboxForm.querySelector("button").click();
  }

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
    } catch (err) {
      errorEl.textContent = err.message;
      show(errorEl);
    } finally {
      btn.disabled = false;
      btn.textContent = "View messages";
    }
  });
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