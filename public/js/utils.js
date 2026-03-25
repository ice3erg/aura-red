(function () {
  // ── Кэш текущего пользователя (заполняется через /api/auth/me) ──
  let _currentUser = null;

  async function fetchMe() {
    try {
      const res  = await fetch("/api/auth/me");
      const data = await res.json();
      if (res.ok && data.ok) { _currentUser = data.user; return data.user; }
    } catch (_) {}
    return null;
  }

  // Синхронный геттер — возвращает кэш (null если ещё не загружен)
  function getCurrentUser() { return _currentUser; }

  async function requireAuth() {
    const user = await fetchMe();
    if (!user) { go("/login"); return null; }
    return user;
  }

  async function updateCurrentUser(patch) {
    try {
      const res  = await fetch("/api/profile", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(patch)
      });
      const data = await res.json();
      if (res.ok && data.ok) { _currentUser = data.user; return data.user; }
    } catch (_) {}
    return null;
  }

  async function clearSession() {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch (_) {}
    _currentUser = null;
  }

  // ── Signals / Chats (заглушки — в следующем этапе) ──────
  function getSignals() { return []; }
  function getChats()   { return []; }

  // ── Avatar markup ────────────────────────────────────────
  function avatarMarkup(user, size) {
    const dim = size === "sm" ? 36 : size === "lg" ? 56 : 44;
    const s   = `width:${dim}px;height:${dim}px;border-radius:50%;object-fit:cover;flex-shrink:0;`;
    if (user?.avatar) {
      return `<img src="${user.avatar}" alt="${user.name || ""}" style="${s}background:#1a1a22;" />`;
    }
    const init = (user?.name || "?").charAt(0).toUpperCase();
    return `<div style="${s}background:#2a1a1a;border:1px solid #3a2020;display:flex;align-items:center;justify-content:center;font-size:${Math.round(dim * 0.38)}px;font-weight:700;color:#ff2b2b;">${init}</div>`;
  }

  // ── Notice helpers ────────────────────────────────────────
  function showNotice(node, text, type = "error") {
    if (!node) return;
    node.textContent = text;
    node.className   = "notice " + type;
  }

  function hideNotice(node) {
    if (!node) return;
    node.textContent = "";
    node.className   = "notice hidden";
  }

  function go(url) { window.location.href = url; }

  window.AuraUtils = {
    fetchMe, getCurrentUser, requireAuth,
    updateCurrentUser, clearSession,
    getSignals, getChats, avatarMarkup,
    showNotice, hideNotice, go
  };
})();
