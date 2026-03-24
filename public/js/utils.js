(function () {
  const USERS_KEY = "aura_users";
  const SESSION_KEY = "aura_session";

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function ensureDemoUser() {
    const users = readJSON(USERS_KEY, []);
    const exists = users.some((u) => u.email === "max@aura.app");

    if (!exists) {
      users.push({
        id: "u_demo_1",
        email: "max@aura.app",
        password: "123456",
        name: "Максим",
        age: "20",
        city: "Санкт-Петербург",
        bio: "Люблю музыку и ночной город.",
        spotifyConnected: false,
        spotifyName: "",
        spotifyId: ""
      });
      writeJSON(USERS_KEY, users);
    }
  }

  function getUsers() {
    ensureDemoUser();
    return readJSON(USERS_KEY, []);
  }

  function saveUsers(users) {
    writeJSON(USERS_KEY, users);
  }

  function getSession() {
    return readJSON(SESSION_KEY, null);
  }

  function setSession(session) {
    writeJSON(SESSION_KEY, session);
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function getCurrentUser() {
    const session = getSession();
    if (!session?.userId) return null;
    return getUsers().find((u) => u.id === session.userId) || null;
  }

  function updateCurrentUser(patch) {
    const session = getSession();
    if (!session?.userId) return null;

    const users = getUsers();
    const index = users.findIndex((u) => u.id === session.userId);
    if (index === -1) return null;

    users[index] = { ...users[index], ...patch };
    saveUsers(users);
    return users[index];
  }

  function showNotice(node, text, type = "error") {
    if (!node) return;
    node.textContent = text;
    node.classList.remove("hidden");
    node.classList.remove("error");
    if (type === "error") node.classList.add("error");
  }

  function hideNotice(node) {
    if (!node) return;
    node.textContent = "";
    node.classList.add("hidden");
  }

  function go(url) {
    window.location.href = url;
  }

  window.AuraUtils = {
    getUsers,
    saveUsers,
    getSession,
    setSession,
    clearSession,
    getCurrentUser,
    updateCurrentUser,
    showNotice,
    hideNotice,
    go
  };

  ensureDemoUser();
})();
