(function () {
  const gate = document.getElementById("account-gate");
  const listEl = document.getElementById("account-list");
  const leadEl = document.getElementById("account-gate-lead");
  const createForm = document.getElementById("account-create-form");
  const passwordModal = document.getElementById("account-password-modal");
  const passwordForm = document.getElementById("account-enter-form");
  const passwordName = document.getElementById("account-password-name");
  const passwordInput = document.getElementById("account-enter-password");
  const notice = document.getElementById("account-notice");
  const btnBack = document.getElementById("btn-account-back");

  let noticeTimer = null;
  let pendingUsername = "";

  function notify(message) {
    if (!notice) return;
    notice.textContent = message;
    notice.classList.add("is-visible");
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => notice.classList.remove("is-visible"), 3200);
  }

  function showPasswordModal(username) {
    pendingUsername = username;
    if (passwordName) passwordName.textContent = username;
    if (passwordInput) passwordInput.value = "";
    if (passwordModal) passwordModal.hidden = false;
    passwordInput?.focus();
  }

  function hidePasswordModal() {
    pendingUsername = "";
    if (passwordModal) passwordModal.hidden = true;
  }

  async function enterRoom(username, password) {
    const res = await fetch("/api/accounts/enter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      notify(data.error || "Cannot enter the room. Password is incorrect.");
      return;
    }
    await openSession(data);
  }

  async function openSession(data) {
    if (window.OVP?.restoreSession) {
      try {
        await window.OVP.restoreSession(data.state);
      } catch {
        /* the room still opens with whatever could be restored */
      }
    }
    window.OVPSession = {
      username: data.username,
      roomId: data.roomId,
      token: data.token,
    };
    window.dispatchEvent(new CustomEvent("ovp:session", { detail: window.OVPSession }));
    hidePasswordModal();
    if (gate) gate.hidden = true;
  }

  function renderAccounts(names) {
    if (!listEl) return;
    listEl.innerHTML = "";
    if (!names.length) {
      if (leadEl) {
        leadEl.textContent = "Create an account to keep this room, the reserved songs, and the song that is playing.";
      }
      return;
    }
    if (leadEl) leadEl.textContent = "Enter a room, or create another account below.";
    const list = document.createElement("div");
    list.className = "account-list";
    names.forEach((username) => {
      const row = document.createElement("div");
      row.className = "account-row";
      const name = document.createElement("span");
      name.className = "account-name";
      name.textContent = username;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "settings-save-btn account-enter-btn";
      button.textContent = "Enter room";
      button.addEventListener("click", () => showPasswordModal(username));
      row.append(name, button);
      list.appendChild(row);
    });
    listEl.appendChild(list);
  }

  createForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = document.getElementById("account-username")?.value || "";
    const password = document.getElementById("account-password")?.value || "";
    const again = document.getElementById("account-password-again")?.value || "";
    if (password !== again) {
      notify("Passwords do not match.");
      return;
    }
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      notify(data.error || "Could not create the account.");
      return;
    }
    await openSession(data);
  });

  passwordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!pendingUsername) return;
    await enterRoom(pendingUsername, passwordInput?.value || "");
  });

  btnBack?.addEventListener("click", hidePasswordModal);

  fetch("/api/accounts")
    .then((res) => res.json())
    .then((data) => renderAccounts(Array.isArray(data.accounts) ? data.accounts : []))
    .catch(() => {
      if (leadEl) leadEl.textContent = "Open this player from the server address to save a room.";
    });
})();
