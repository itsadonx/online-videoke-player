(function () {
  const statusEl = document.getElementById("conn-status");
  const joinScreen = document.getElementById("screen-join");
  const formScreen = document.getElementById("screen-form");
  const codeInput = document.getElementById("code-input");
  const joinError = document.getElementById("join-error");
  const formError = document.getElementById("form-error");
  const formDone = document.getElementById("form-done");
  const form = document.getElementById("signup-form");
  const inputs = {
    username: document.getElementById("signup-username"),
    password: document.getElementById("signup-password"),
    passwordAgain: document.getElementById("signup-password-again"),
  };

  let socket = null;
  let applying = false;
  let joined = false;

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = "remote-status" + (kind ? ` ${kind}` : "");
  }

  function showJoinError(message) {
    if (!joinError) return;
    joinError.textContent = message || "";
    joinError.classList.toggle("hidden", !message);
  }

  function showFormError(message) {
    if (!formError) return;
    formError.textContent = message || "";
    formError.classList.toggle("hidden", !message);
  }

  function showForm() {
    joinScreen?.classList.add("hidden");
    if (joinScreen) joinScreen.hidden = true;
    formScreen?.classList.remove("hidden");
    if (formScreen) formScreen.hidden = false;
    inputs.username?.focus();
  }

  function applyPatch(patch) {
    if (!patch || typeof patch !== "object") return;
    applying = true;
    Object.keys(inputs).forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) return;
      const input = inputs[key];
      if (input && input.value !== patch[key]) input.value = patch[key];
    });
    applying = false;
  }

  function emitPatch(key) {
    if (applying || !joined || !socket?.connected) return;
    socket.emit("signup:update", { [key]: inputs[key]?.value || "" });
  }

  function lockForm() {
    Object.values(inputs).forEach((input) => {
      if (input) input.disabled = true;
    });
    const button = document.getElementById("btn-create");
    if (button) button.disabled = true;
  }

  function join(code) {
    const id = String(code || "").trim().toUpperCase();
    if (!id || !socket?.connected) return;
    showJoinError("");
    socket.emit("signup:join", { code: id }, (res) => {
      if (!res?.ok) {
        showJoinError(res?.error || "Could not connect to the player.");
        setStatus("Not connected", "err");
        return;
      }
      joined = true;
      applyPatch(res.fields || {});
      showForm();
      setStatus("Connected", "ok");
    });
  }

  Object.keys(inputs).forEach((key) => {
    inputs[key]?.addEventListener("input", () => emitPatch(key));
  });

  document.getElementById("btn-join")?.addEventListener("click", () => join(codeInput?.value));
  codeInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") join(codeInput.value);
  });

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!joined || !socket?.connected) return;
    showFormError("");
    socket.emit("signup:submit");
    setStatus("Creating…", "");
  });

  if (typeof io === "undefined") {
    setStatus("Open this page from the player server.", "err");
    return;
  }

  socket = io({ transports: ["websocket", "polling"] });
  socket.on("connect", () => {
    setStatus(joined ? "Connected" : "Enter the code", joined ? "ok" : "");
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    if (code && !joined) join(code);
  });
  socket.on("disconnect", () => {
    if (!formDone || formDone.classList.contains("hidden")) setStatus("Disconnected", "err");
  });
  socket.on("connect_error", () => setStatus("Cannot reach the player.", "err"));
  socket.on("signup:draft", applyPatch);
  socket.on("signup:result", (result) => {
    if (result?.ok) {
      showFormError("");
      formDone?.classList.remove("hidden");
      lockForm();
      joined = false;
      setStatus("Account created", "ok");
      return;
    }
    const error = result?.error || "Could not create the account.";
    showFormError(error);
    setStatus("Connected", "ok");
  });
  socket.on("signup:closed", () => {
    if (formDone && !formDone.classList.contains("hidden")) return;
    joined = false;
    lockForm();
    showFormError("The player closed account creation.");
    setStatus("Closed", "err");
  });
})();
