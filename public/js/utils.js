(function () {
  let _me = null;

  async function fetchMe() {
    // Мгновенно возвращаем кэш из sessionStorage
    if (!_me) {
      try {
        const cached = sessionStorage.getItem('aura_me');
        if (cached) _me = JSON.parse(cached);
      } catch(_) {}
    }

    // Параллельно обновляем с сервера
    try {
      const r = await fetch("/api/auth/me");
      const d = await r.json();
      if (r.ok && d.ok) {
        _me = d.user;
        try { sessionStorage.setItem('aura_me', JSON.stringify(d.user)); } catch(_) {}
        return d.user;
      }
      // 401 — чистим кэш
      if (r.status === 401) {
        _me = null;
        try { sessionStorage.removeItem('aura_me'); } catch(_) {}
      }
    } catch (_) {}

    // Если сеть недоступна — возвращаем кэш
    return _me || null;
  }

  function getCurrentUser() { return _me; }

  async function requireAuth() {
    // Сначала проверяем кэш
    try {
      const cached = sessionStorage.getItem('aura_me');
      if (cached) {
        const u = JSON.parse(cached);
        if (u?.id) {
          _me = u;
          // Тихо обновляем в фоне
          fetchMe().catch(() => {});
          return u;
        }
      }
    } catch(_) {}

    // Нет кэша — ждём сеть
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

  // ── Badge (непрочитанные) ──────────────────────────────
  // Рендерит красную точку/цифру на иконке Chat в навбаре
  function renderBadge(count) {
    // Ищем ссылку на /chat в навбаре
    const chatLink = document.querySelector('.nav-link[href="/chat"]');
    if (!chatLink) return;

    // Убираем старый бейдж
    chatLink.querySelector('.nav-badge')?.remove();

    if (count <= 0) return;

    // Позиционируем относительно svg иконки
    chatLink.style.position = 'relative';
    const badge = document.createElement('div');
    badge.className = 'nav-badge';
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.style.cssText = `
      position:absolute;
      top:4px; right:calc(50% - 14px);
      min-width:16px; height:16px;
      padding:0 4px;
      border-radius:99px;
      background:#ff2b2b;
      color:#fff;
      font-size:10px;
      font-weight:800;
      display:flex;
      align-items:center;
      justify-content:center;
      border:2px solid var(--bg,#060608);
      pointer-events:none;
      line-height:1;
      box-shadow:0 0 8px rgba(255,43,43,0.6);
      animation:badgePop 0.3s cubic-bezier(0.34,1.56,0.64,1) both;
    `;
    chatLink.appendChild(badge);

    // Добавляем анимацию если ещё нет
    if (!document.getElementById('badge-style')) {
      const st = document.createElement('style');
      st.id = 'badge-style';
      st.textContent = `@keyframes badgePop{from{transform:scale(0)}to{transform:scale(1)}}`;
      document.head.appendChild(st);
    }
  }

  async function pollUnread() {
    try {
      const r = await fetch('/api/unread');
      if (!r.ok) return;
      const d = await r.json();
      if (d.ok) renderBadge(d.total);
    } catch (_) {}
  }

  // Запускаем поллинг бейджа на всех страницах кроме логина/регистрации
  function initBadge() {
    const path = window.location.pathname;
    if (path === '/login' || path === '/signup') return;
    // Первый запрос через 1 сек после загрузки
    setTimeout(pollUnread, 1000);
    // Затем каждые 15 сек
    setInterval(pollUnread, 15000);
  }

  // Запускаем после загрузки DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBadge);
  } else {
    initBadge();
  }

  // ── Keep-alive клиентский пинг ─────────────────────────
  // Дополнительно пингуем с клиента раз в 8 минут
  setInterval(() => {
    fetch('/ping').catch(() => {});
  }, 8 * 60 * 1000);

  window.AuraUtils = {
    fetchMe, getCurrentUser, requireAuth,
    updateCurrentUser, clearSession,
    getSignals, getChats, avatarMarkup,
    showNotice, hideNotice, go,
    pollUnread, renderBadge,
  };
})();
