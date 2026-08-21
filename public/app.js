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
      await api(`/api/users/${encodeURIComponent(username)}`);
    } catch (e) {
      $("#send-form").remove();
      $("#sent").classList.remove("hidden");
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
      hide($(".tagline"));
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