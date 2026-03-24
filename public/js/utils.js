(function () {
  const USERS_KEY    = "aura_users";
  const SESSION_KEY  = "aura_session";
  const SIGNALS_KEY  = "aura_signals";
  const CHATS_KEY    = "aura_chats";

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function ensureDemoUser() {
    const users = readJSON(USERS_KEY, []);
    if (users.some((u) => u.email === "max@aura.app")) return;
    users.push({
      id: "u_demo_1",
      email: "max@aura.app",
      password: "123456",
      name: "Максим",
      age: "20",
      city: "Санкт-Петербург",
      bio: "Люблю музыку и ночной город.",
      avatar: null,
      spotifyConnected: false,
      spotifyName: "",
      spotifyId: ""
    });
    writeJSON(USERS_KEY, users);
  }

  function getUsers()        { ensureDemoUser(); return readJSON(USERS_KEY, []); }
  function saveUsers(users)  { writeJSON(USERS_KEY, users); }
  function getSession()      { return readJSON(SESSION_KEY, null); }
  function setSession(s)     { writeJSON(SESSION_KEY, s); }
  function clearSession()    { localStorage.removeItem(SESSION_KEY); }

  function getCurrentUser() {
    const session = getSession();
    if (!session?.userId) return null;
    return getUsers().find((u) => u.id === session.userId) || null;
  }

  function requireAuth() {
    const user = getCurrentUser();
    if (!user) { go("/login"); return null; }
    return user;
  }

  function updateCurrentUser(patch) {
    const session = getSession();
    if (!session?.userId) return null;
    const users = getUsers();
    const idx = users.findIndex((u) => u.id === session.userId);
    if (idx === -1) return null;
    users[idx] = { ...users[idx], ...patch };
    saveUsers(users);
    return users[idx];
  }

  // Signals (заглушка — в будущем серверная)
  function getSignals() {
    return readJSON(SIGNALS_KEY, []);
  }

  function addSignal(signal) {
    const signals = getSignals();
    signals.unshift({ id: "s_" + Date.now(), time: new Date().toLocaleTimeString(), ...signal });
    writeJSON(SIGNALS_KEY, signals);
  }

  // Chats (заглушка)
  function getChats() {
    return readJSON(CHATS_KEY, []);
  }

  // Аватар — HTML-строка для вставки
  function avatarMarkup(user, size) {
    const dim = size === "sm" ? 36 : size === "lg" ? 56 : 44;
    const style = `width:${dim}px;height:${dim}px;border-radius:50%;object-fit:cover;flex-shrink:0;`;
    if (user?.avatar) {
      return `<img src="${user.avatar}" alt="${user.name || ''}" style="${style}background:#1a1a22;" />`;
    }
    const initials = (user?.name || "?").charAt(0).toUpperCase();
    return `<div style="${style}background:#2a1a1a;border:1px solid #3a2020;display:flex;align-items:center;justify-content:center;font-size:${Math.round(dim * 0.38)}px;font-weight:700;color:#ff2b2b;">${initials}</div>`;
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
    getUsers, saveUsers,
    getSession, setSession, clearSession,
    getCurrentUser, requireAuth, updateCurrentUser,
    getSignals, addSignal,
    getChats,
    avatarMarkup,
    showNotice, hideNotice,
    go
  };

  ensureDemoUser();
})();
