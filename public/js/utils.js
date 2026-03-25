(function () {
  let _me = null;

  async function fetchMe() {
    try {
      const r = await fetch("/api/auth/me");
      const d = await r.json();
      if (r.ok && d.ok) { _me = d.user; return d.user; }
    } catch (_) {}
    return null;
  }

  function getCurrentUser() { return _me; }

  async function requireAuth() {
    const u = await fetchMe();
    if (!u) { go("/login"); return null; }
    return u;
  }

  async function updateCurrentUser(patch) {
    try {
      const r = await fetch("/api/profile", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const d = await r.json();
      if (r.ok && d.ok) { _me = d.user; return d.user; }
    } catch (_) {}
    return null;
  }

  async function clearSession() {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch (_) {}
    _me = null;
  }

  function getSignals() { return []; }
  function getChats()   { return []; }

  function avatarMarkup(user, size) {
    const dim = size === "sm" ? 36 : size === "lg" ? 56 : 44;
    const s = `width:${dim}px;height:${dim}px;border-radius:50%;object-fit:cover;flex-shrink:0;`;
    if (user?.avatar)
      return `<img src="${user.avatar}" alt="" style="${s}background:#1a1a22;" />`;
    const i = (user?.name || "?")[0].toUpperCase();
    return `<div style="${s}background:#2a1a1a;border:1px solid #3a2020;display:flex;align-items:center;justify-content:center;font-size:${Math.round(dim*.38)}px;font-weight:700;color:#ff2b2b;">${i}</div>`;
  }

  function showNotice(node, text, type = "error") {
    if (!node) return;
    node.textContent = text;
    node.className = "notice " + type;
  }

  function hideNotice(node) {
    if (!node) return;
    node.textContent = "";
    node.className = "notice hidden";
  }

  function go(url) { window.location.href = url; }

  window.AuraUtils = {
    fetchMe, getCurrentUser, requireAuth,
    updateCurrentUser, clearSession,
    getSignals, getChats, avatarMarkup,
    showNotice, hideNotice, go
  };
})();
