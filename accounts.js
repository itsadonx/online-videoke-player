(function () {
  const gate = document.getElementById("account-gate");
  const listEl = document.getElementById("account-list");
  const leadEl = document.getElementById("account-gate-lead");
  const createModal = document.getElementById("account-create-modal");
  const createForm = document.getElementById("account-create-form");
  const btnShowCreate = document.getElementById("btn-show-create");
  const btnCreateBack = document.getElementById("btn-create-back");
  const passwordModal = document.getElementById("account-password-modal");
  const passwordForm = document.getElementById("account-enter-form");
  const passwordName = document.getElementById("account-password-name");
  const passwordInput = document.getElementById("account-enter-password");
  const notice = document.getElementById("account-notice");
  const btnBack = document.getElementById("btn-account-back");
  const signupCodeEl = document.getElementById("account-signup-code");
  const signupQrWrap = document.getElementById("account-signup-qr-wrap");
  const signupQrEl = document.getElementById("account-signup-qr");
  const signupStatusEl = document.getElementById("account-signup-status");
  const signupInputs = {
    username: document.getElementById("account-username"),
    password: document.getElementById("account-password"),
    passwordAgain: document.getElementById("account-password-again"),
  };

  let noticeTimer = null;
  let pendingUsername = "";
  let signupSocket = null;
  let signupApplying = false;
  let creating = false;
  let ioWaiters = [];

  function notify(message) {
    if (!notice) return;
    notice.textContent = message;
    notice.classList.add("is-visible");
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => notice.classList.remove("is-visible"), 3200);
  }

  function setSignupStatus(text, ok) {
    if (!signupStatusEl) return;
    signupStatusEl.textContent = text;
    signupStatusEl.className = "settings-status" + (ok ? " ok" : "");
  }

  function renderSignupCode(code) {
    if (signupCodeEl) signupCodeEl.textContent = code || "…";
    const url = code ? `${location.origin}/signup?code=${encodeURIComponent(code)}` : "";
    if (code && signupQrEl && signupQrWrap) {
      signupQrEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(url)}`;
      signupQrWrap.classList.remove("hidden");
    } else if (signupQrWrap) {
      signupQrWrap.classList.add("hidden");
    }
  }

  function applySignupPatch(patch) {
    if (!patch || typeof patch !== "object") return;
    signupApplying = true;
    Object.keys(signupInputs).forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) return;
      const input = signupInputs[key];
      if (input && input.value !== patch[key]) input.value = patch[key];
    });
    signupApplying = false;
  }

  function emitSignupPatch(key) {
    if (signupApplying || !signupSocket?.connected) return;
    signupSocket.emit("signup:update", { [key]: signupInputs[key]?.value || "" });
  }

  function publishSignupResult(ok, error) {
    if (!signupSocket?.connected) return;
    signupSocket.emit("signup:result", { ok, error: error || "" });
  }

  function whenIo(done) {
    if (typeof io !== "undefined") {
      done();
      return;
    }
    ioWaiters.push(done);
    if (ioWaiters.length > 1) return;
    const finish = () => {
      if (typeof io === "undefined") return;
      const waiting = ioWaiters.splice(0);
      waiting.forEach((fn) => fn());
    };
    const existing = document.querySelector('script[src="/socket.io/socket.io.js"]');
    if (!existing) {
      const script = document.createElement("script");
      script.src = "/socket.io/socket.io.js";
      script.async = true;
      script.onload = finish;
      script.onerror = () => setSignupStatus("Open this player from the server address to use a phone.", false);
      document.head.appendChild(script);
    }
    const timer = setInterval(() => {
      if (typeof io === "undefined") return;
      clearInterval(timer);
      finish();
    }, 50);
  }

  function bindSignupSocket() {
    if (signupSocket || typeof io === "undefined") return;
    signupSocket = io({ transports: ["websocket", "polling"] });
    signupSocket.on("connect", () => {
      if (createModal && !createModal.hidden) openSignupRemote();
    });
    signupSocket.on("signup:draft", applySignupPatch);
    signupSocket.on("signup:phones", ({ count }) => {
      const phones = Number(count) || 0;
      setSignupStatus(
        phones ? "Phone connected. Typing stays in sync." : "Scan the QR code with a phone.",
        phones > 0
      );
    });
    signupSocket.on("signup:submit", () => {
      createAccount();
    });
    signupSocket.on("connect_error", () => {
      setSignupStatus("Phone link unavailable. Start the server, then reopen this page.", false);
    });
  }

  function openSignupRemote() {
    if (location.protocol !== "http:" && location.protocol !== "https:") {
      setSignupStatus("Open this player from the server address to use a phone.", false);
      return;
    }
    whenIo(() => {
      bindSignupSocket();
      if (!signupSocket?.connected) {
        setSignupStatus("Connecting the phone link…", false);
        return;
      }
      signupSocket.emit("signup:host-open", {}, (res) => {
        if (!createModal || createModal.hidden) {
          signupSocket.emit("signup:host-close");
          return;
        }
        if (!res?.ok || !res.code) {
          setSignupStatus("Could not open the phone link.", false);
          return;
        }
        renderSignupCode(res.code);
        setSignupStatus("Scan the QR code with a phone.", false);
      });
    });
  }

  function closeSignupRemote() {
    renderSignupCode("");
    if (signupSocket?.connected) signupSocket.emit("signup:host-close");
  }

  function showCreateModal() {
    hidePasswordModal();
    if (createForm) createForm.reset();
    if (createModal) createModal.hidden = false;
    openSignupRemote();
    signupInputs.username?.focus();
  }

  function hideCreateModal() {
    if (createModal) createModal.hidden = true;
    closeSignupRemote();
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
    hideCreateModal();
    if (gate) gate.hidden = true;
  }

  function renderAccounts(names) {
    if (!listEl) return;
    listEl.innerHTML = "";
    if (leadEl) {
      leadEl.textContent = names.length
        ? "Choose a saved room, or create one."
        : "No rooms yet. Use the button above to create one.";
    }
    if (!names.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 2;
      cell.className = "account-empty";
      cell.textContent = "No saved users yet.";
      row.appendChild(cell);
      listEl.appendChild(row);
      return;
    }
    names.forEach((username) => {
      const row = document.createElement("tr");
      const nameCell = document.createElement("td");
      nameCell.className = "account-name";
      nameCell.textContent = username;
      const actionCell = document.createElement("td");
      actionCell.className = "account-action";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "settings-save-btn account-enter-btn";
      button.textContent = "Enter room";
      button.addEventListener("click", () => showPasswordModal(username));
      actionCell.appendChild(button);
      row.append(nameCell, actionCell);
      listEl.appendChild(row);
    });
  }

  async function createAccount() {
    if (creating) return;
    const username = signupInputs.username?.value || "";
    const password = signupInputs.password?.value || "";
    const again = signupInputs.passwordAgain?.value || "";
    if (password !== again) {
      notify("Passwords do not match.");
      publishSignupResult(false, "Passwords do not match.");
      return;
    }
    creating = true;
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const error = data.error || "Could not create the account.";
        notify(error);
        publishSignupResult(false, error);
        return;
      }
      publishSignupResult(true, "");
      await openSession(data);
    } finally {
      creating = false;
    }
  }

  Object.keys(signupInputs).forEach((key) => {
    signupInputs[key]?.addEventListener("input", () => emitSignupPatch(key));
  });

  createForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    createAccount();
  });

  passwordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!pendingUsername) return;
    await enterRoom(pendingUsername, passwordInput?.value || "");
  });

  btnBack?.addEventListener("click", hidePasswordModal);
  btnShowCreate?.addEventListener("click", showCreateModal);
  btnCreateBack?.addEventListener("click", hideCreateModal);

  fetch("/api/accounts")
    .then((res) => res.json())
    .then((data) => renderAccounts(Array.isArray(data.accounts) ? data.accounts : []))
    .catch(() => {
      if (leadEl) leadEl.textContent = "Open this player from the server address to save a room.";
    });
})();
