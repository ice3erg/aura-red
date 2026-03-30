(function () {
  const U = window.AuraUtils;

  function markFilled(input) {
    if (!input) return;
    const upd = () => input.value.trim() ? input.classList.add('has-value') : input.classList.remove('has-value');
    upd(); input.addEventListener('input', upd);
  }

  function showNotice(text, type = 'error') {
    const el = document.getElementById('profileNotice');
    if (!el) return;
    el.textContent = text;
    el.className = 'notice visible ' + type;
    if (type === 'success') setTimeout(() => { el.className = 'notice'; }, 3000);
  }

  function fileToBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  // ── Aura system ───────────────────────────────────────────
  const RANKS = [
    { name: 'Новичок',      min: 0   },
    { name: 'Слушатель',    min: 10  },
    { name: 'Меломан',      min: 30  },
    { name: 'Вибратор',     min: 75  },
    { name: 'Резонатор',    min: 150 },
    { name: 'Аурист',       min: 300 },
    { name: 'Легенда',      min: 600 },
  ];

  function getRank(pts) {
    for (let i = RANKS.length - 1; i >= 0; i--) {
      if (pts >= RANKS[i].min) return { rank: RANKS[i], next: RANKS[i + 1] || null, idx: i };
    }
    return { rank: RANKS[0], next: RANKS[1], idx: 0 };
  }

  function renderAura(pts) {
    const { rank, next } = getRank(pts);
    const scoreEl = document.getElementById('auraScore');
    const rankEl  = document.getElementById('auraRank');
    const barEl   = document.getElementById('auraBarFill');
    const nextEl  = document.getElementById('auraNext');
    if (scoreEl) scoreEl.textContent = pts;
    if (rankEl)  rankEl.textContent  = rank.name;
    if (next) {
      const pct = Math.min(100, Math.round(((pts - rank.min) / (next.min - rank.min)) * 100));
      if (barEl)  barEl.style.width = pct + '%';
      if (nextEl) nextEl.textContent = (next.min - pts) + ' до «' + next.name + '»';
    } else {
      if (barEl)  barEl.style.width = '100%';
      if (nextEl) nextEl.textContent = 'Максимальный уровень';
    }
  }

  // ── Photo collage ─────────────────────────────────────────
  function buildCollage(photos) {
    const grid = document.getElementById('collageGrid');
    if (!grid) return;
    const n = Math.min(photos.length, 6);
    grid.className = `collage-grid n${n}`;

    if (n === 0) {
      grid.innerHTML = `<div class="collage-empty" onclick="document.getElementById('photoInput').click()">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
        Добавь фото для коллажа
      </div>`;
      return;
    }

    grid.innerHTML = photos.slice(0, n).map((src, i) => {
      const span = (n === 3 && i === 0) ? ' span2' : '';
      return `<div class="collage-cell${span}" style="position:relative;">
        <img src="${src}" alt="" loading="lazy" />
        <button onclick="deletePhoto(${i})" style="position:absolute;top:5px;right:5px;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,0.7);border:none;color:#fff;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;z-index:5;">✕</button>
      </div>`;
    }).join('');
  }

  window.deletePhoto = function(i) {
    _photos.splice(i, 1);
    _photosChanged = true;
    buildCollage(_photos);
  };

  // ── Track ticker ──────────────────────────────────────────
  function buildTicker(history) {
    if (!history.length) return;
    const section = document.getElementById('tickerSection');
    const track   = document.getElementById('tickerTrack');
    if (!section || !track) return;
    section.style.display = '';

    // Дублируем для бесшовного цикла
    const items = [...history.slice(0, 8), ...history.slice(0, 8)];
    track.innerHTML = items.map(t => `
      <div class="ticker-item">
        ${t.image
          ? `<img class="ticker-cover" src="${t.image}" alt="" />`
          : `<div class="ticker-cover-ph"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`
        }
        <span class="ticker-text">${t.track}</span>
        <span class="ticker-artist">${t.artist}</span>
        <span class="ticker-sep">·</span>
      </div>
    `).join('');

    // Скорость зависит от количества треков
    const dur = Math.max(12, items.length * 2.5);
    track.style.animationDuration = dur + 's';
  }

  let _photos = [];
  let _photosChanged = false;
  let _avatarData = null;
  let _avatarChanged = false;

  async function init() {
    const user = await U.requireAuth();
    if (!user) return;

    // ── Fields ──────────────────────────────────────────────
    const fieldName = document.getElementById('fieldName');
    const fieldAge  = document.getElementById('fieldAge');
    const fieldCity = document.getElementById('fieldCity');
    const fieldBio  = document.getElementById('fieldBio');
    if (fieldName) { fieldName.value = user.name || ''; markFilled(fieldName); }
    if (fieldAge)  { fieldAge.value  = user.age  || ''; markFilled(fieldAge); }
    if (fieldCity) { fieldCity.value = user.city || ''; markFilled(fieldCity); }
    if (fieldBio)  { fieldBio.value  = user.bio  || ''; markFilled(fieldBio); }

    // Live name preview
    function updateNameDisplay() {
      const nd  = document.getElementById('nameDisplay');
      const cd  = document.getElementById('cityDisplay');
      const ad  = document.getElementById('ageDisplay');
      if (nd) nd.textContent = fieldName?.value.trim() || user.name || '—';
      const city = fieldCity?.value.trim() || user.city || '';
      const age  = fieldAge?.value.trim()  || user.age  || '';
      if (cd) cd.textContent = city ? `📍 ${city}` : '';
      if (ad) ad.textContent = age  ? `${age} лет` : '';
    }
    updateNameDisplay();
    [fieldName, fieldAge, fieldCity].forEach(f => f?.addEventListener('input', updateNameDisplay));

    // ── Avatar ──────────────────────────────────────────────
    const avatarImg = document.getElementById('avatarImg');
    const avatarPh  = document.getElementById('avatarPh');
    if (user.avatar) { avatarImg.src = user.avatar; avatarImg.classList.add('visible'); avatarPh.style.display = 'none'; }

    document.getElementById('avatarInput')?.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { showNotice('Фото до 5 МБ'); return; }
      _avatarData = await fileToBase64(file);
      _avatarChanged = true;
      avatarImg.src = _avatarData; avatarImg.classList.add('visible');
      avatarPh.style.display = 'none';
    });

    // ── Rays when playing ───────────────────────────────────
    if (user.currentTrack?.track) {
      document.getElementById('avatarRays')?.classList.add('playing');
    }

    // ── Photos collage ──────────────────────────────────────
    _photos = Array.isArray(user.photos) ? [...user.photos] : [];
    buildCollage(_photos);

    document.getElementById('photoInput')?.addEventListener('change', async e => {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        if (_photos.length >= 6) break;
        if (file.size > 5 * 1024 * 1024) continue;
        _photos.push(await fileToBase64(file));
        _photosChanged = true;
      }
      e.target.value = '';
      buildCollage(_photos);
    });

    // ── Aura ────────────────────────────────────────────────
    renderAura(user.auraPoints || 0);

    // ── Stats ────────────────────────────────────────────────
    try {
      const [sigsR, chatsR] = await Promise.all([
        fetch('/api/signals').then(r => r.json()),
        fetch('/api/chats').then(r => r.json()),
      ]);
      // Только принятые сигналы (реальные связи)
      const acceptedSigs = (sigsR.signals || []).filter(s => s.status === 'accepted').length;
      const el = document.getElementById('statSignals');
      if (el) el.textContent = acceptedSigs;
      const chEl = document.getElementById('statChats');
      if (chEl) chEl.textContent = (chatsR.chats || []).length;
    } catch {}

    // Стрик
    const streakEl = document.getElementById('statStreak');
    if (streakEl) {
      const s = user.streakDays || 0;
      streakEl.textContent = s;
      if (s >= 7)  streakEl.style.color = '#ff8c00';
      if (s >= 30) streakEl.style.color = '#ff2b2b';
    }

    // Реферальный код = имя пользователя
    const refEl = document.getElementById('refCodeText');
    if (refEl) refEl.textContent = user.name || '—';

    // Реакции на мои треки
    try {
      const rxR = await fetch('/api/reactions').then(r => r.json());
      const reactions = rxR.reactions || [];
      if (reactions.length) {
        const sec  = document.getElementById('reactionsSection');
        const list = document.getElementById('reactionsList');
        if (sec)  sec.style.display = '';
        if (list) {
          list.innerHTML = reactions.slice(0, 5).map(r => `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:12px;background:rgba(255,255,255,0.04);">
              <div style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.1);overflow:hidden;flex-shrink:0;">
                ${r.fromAvatar ? `<img src="${r.fromAvatar}" style="width:100%;height:100%;object-fit:cover;" />` : ''}
              </div>
              <div style="flex:1;min-width:0;">
                <span style="font-weight:700;font-size:13px;">${r.fromName}</span>
                <span style="color:rgba(255,255,255,0.4);font-size:12px;"> реагировал на </span>
                <span style="font-size:13px;font-weight:600;">${r.track}</span>
              </div>
              <div style="font-size:22px;">${r.emoji}</div>
            </div>`).join('');
        }
      }
    } catch(_) {}

    // Дни с регистрации
    if (user.createdAt) {
      const days = Math.max(1, Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86400000));
      const dEl = document.getElementById('statDays');
      if (dEl) dEl.textContent = days;
    }

    // ── Ticker ──────────────────────────────────────────────
    const history = Array.isArray(user.trackHistory) ? user.trackHistory : [];
    buildTicker(history);

    // ── Share ────────────────────────────────────────────────
    document.getElementById('shareBtn')?.addEventListener('click', () => {
      const url = `${location.origin}/u/${encodeURIComponent(user.name || '')}`;
      if (navigator.share) {
        navigator.share({ title: `${user.name} в +aura`, url });
      } else {
        navigator.clipboard?.writeText(url).then(() => showNotice('Ссылка скопирована!', 'success'));
      }
    });

    // ── Яндекс Музыка ─────────────────────────────────────
    const yandexCard   = document.getElementById('yandexCard');
    const yandexStatus = document.getElementById('yandexStatus');
    const yandexBtn    = document.getElementById('yandexBtn');
    const yandexWrap   = document.getElementById('yandexInputWrap');

    function renderYandex(connected) {
      if (connected) {
        yandexCard?.classList.add('connected');
        if (yandexStatus) { yandexStatus.textContent = 'Подключено'; yandexStatus.classList.add('connected'); }
        if (yandexBtn)    { yandexBtn.textContent = 'Отключить'; yandexBtn.className = 'music-action disconnect'; }
        if (yandexWrap)   yandexWrap.style.display = 'none';
      } else {
        yandexCard?.classList.remove('connected');
        if (yandexStatus) { yandexStatus.textContent = 'Не подключено'; yandexStatus.classList.remove('connected'); }
        if (yandexBtn)    { yandexBtn.textContent = 'Подключить'; yandexBtn.className = 'music-action connect'; }
      }
    }
    renderYandex(!!user.yandexToken);

    yandexBtn?.addEventListener('click', async () => {
      if (user.yandexToken) {
        yandexBtn.disabled = true; yandexBtn.textContent = '...';
        await fetch('/api/yandex/disconnect', { method: 'POST' });
        user.yandexToken = '';
        renderYandex(false); yandexBtn.disabled = false;
      } else {
        if (yandexWrap) yandexWrap.style.display = '';
        document.getElementById('yandexTokenField')?.focus();
      }
    });

    document.getElementById('yandexSaveBtn')?.addEventListener('click', async () => {
      const token = document.getElementById('yandexTokenField')?.value.trim();
      if (!token) { showNotice('Вставь токен'); return; }
      const btn = document.getElementById('yandexSaveBtn');
      btn.disabled = true; btn.textContent = 'Проверяем...';
      try {
        const r = await fetch('/api/yandex/connect', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        const d = await r.json();
        if (d.ok) {
          user.yandexToken = token;
          renderYandex(true);
          showNotice('Яндекс Музыка подключена!', 'success');
        } else {
          showNotice(d.error || 'Неверный токен');
        }
      } catch { showNotice('Ошибка сети'); }
      btn.disabled = false; btn.textContent = 'Сохранить';
    });

    // ── Last.fm ───────────────────────────────────────────
    const lastfmCard    = document.getElementById('lastfmCard');
    const lastfmStatus  = document.getElementById('lastfmStatus');
    const lastfmBtn     = document.getElementById('lastfmBtn');
    const lastfmInput   = document.getElementById('lastfmInputWrap');
    const spotifyCard   = document.getElementById('spotifyCard');
    const spotifyStatus = document.getElementById('spotifyStatus');
    const spotifyBtn    = document.getElementById('spotifyBtn');

    function renderLastfm(connected, username) {
      if (connected && username) {
        lastfmCard?.classList.add('connected');
        if (lastfmStatus) { lastfmStatus.textContent = `@${username}`; lastfmStatus.classList.add('connected'); }
        if (lastfmBtn)    { lastfmBtn.textContent = 'Отключить'; lastfmBtn.className = 'music-action disconnect'; }
        if (lastfmInput)  lastfmInput.style.display = 'none';
      } else {
        lastfmCard?.classList.remove('connected');
        if (lastfmStatus) { lastfmStatus.textContent = 'Не подключено'; lastfmStatus.classList.remove('connected'); }
        if (lastfmBtn)    { lastfmBtn.textContent = 'Подключить'; lastfmBtn.className = 'music-action connect'; }
        if (lastfmInput)  lastfmInput.style.display = '';
      }
    }

    function renderSpotify(connected) {
      if (connected) {
        spotifyCard?.classList.add('connected');
        if (spotifyStatus) { spotifyStatus.textContent = 'Подключено'; spotifyStatus.classList.add('connected'); }
        if (spotifyBtn)    { spotifyBtn.textContent = 'Отключить'; spotifyBtn.className = 'music-action disconnect'; }
      } else {
        spotifyCard?.classList.remove('connected');
        if (spotifyStatus) { spotifyStatus.textContent = 'Не подключено'; spotifyStatus.classList.remove('connected'); }
        if (spotifyBtn)    { spotifyBtn.textContent = 'Подключить'; spotifyBtn.className = 'music-action connect'; }
      }
    }

    renderLastfm(user.lastfmConnected, user.lastfmUsername);
    renderSpotify(user.spotifyConnected);

    lastfmBtn?.addEventListener('click', async () => {
      if (user.lastfmConnected) {
        lastfmBtn.disabled = true; lastfmBtn.textContent = '...';
        await U.updateCurrentUser({ lastfmConnected: false, lastfmUsername: '' });
        user.lastfmConnected = false; user.lastfmUsername = '';
        renderLastfm(false, ''); lastfmBtn.disabled = false;
      } else {
        if (lastfmInput) lastfmInput.style.display = '';
        document.getElementById('lastfmUsernameField')?.focus();
      }
    });

    document.getElementById('lastfmSaveBtn')?.addEventListener('click', async () => {
      const input = document.getElementById('lastfmUsernameField');
      const username = (input?.value || '').trim().toLowerCase();
      if (!username) { showNotice('Введи Last.fm username'); return; }
      const saveBtn = document.getElementById('lastfmSaveBtn');
      saveBtn.disabled = true; saveBtn.textContent = 'Проверяем...';
      try {
        const r = await fetch(`/api/lastfm/current-track?username=${encodeURIComponent(username)}`);
        const d = await r.json();
        if (!d.ok) { showNotice('Пользователь Last.fm не найден'); saveBtn.disabled = false; saveBtn.textContent = 'Сохранить'; return; }
        await U.updateCurrentUser({ lastfmConnected: true, lastfmUsername: username });
        user.lastfmConnected = true; user.lastfmUsername = username;
        renderLastfm(true, username);
        showNotice('Last.fm подключён!', 'success');
      } catch { showNotice('Ошибка сети'); }
      saveBtn.disabled = false; saveBtn.textContent = 'Сохранить';
    });

    spotifyBtn?.addEventListener('click', async () => {
      if (user.spotifyConnected) {
        spotifyBtn.disabled = true; spotifyBtn.textContent = '...';
        await U.updateCurrentUser({ spotifyConnected: false, spotifyAccessToken: '', spotifyRefreshToken: '' });
        user.spotifyConnected = false; renderSpotify(false); spotifyBtn.disabled = false;
      } else {
        location.href = '/spotify/login';
      }
    });

    // ── Save ─────────────────────────────────────────────────
    document.getElementById('saveBtn')?.addEventListener('click', async () => {
      const name = fieldName?.value.trim() || '';
      const city = fieldCity?.value.trim() || '';
      if (!name) { showNotice('Введи имя'); return; }
      if (!city) { showNotice('Введи город'); return; }
      const btn = document.getElementById('saveBtn');
      if (btn) { btn.disabled = true; btn.textContent = 'Сохраняем...'; }
      const payload = { name, age: fieldAge?.value.trim() || '', city, bio: fieldBio?.value.trim() || '' };
      if (_avatarChanged) payload.avatar = _avatarData;
      if (_photosChanged) payload.photos = _photos;
      const updated = await U.updateCurrentUser(payload);
      if (btn) { btn.disabled = false; btn.textContent = 'Сохранить профиль'; }
      if (updated) {
        showNotice('Профиль сохранён!', 'success');
        updateNameDisplay();
        buildCollage(_photos);
        _avatarChanged = false; _photosChanged = false;
      } else {
        showNotice('Ошибка сохранения');
      }
    });

    // ── Logout ───────────────────────────────────────────────
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      U.go('/login');
    });
  }

  init();
})();

window.copyRefCode = function() {
  const el = document.getElementById('refCodeText');
  if (!el) return;
  navigator.clipboard?.writeText(el.textContent).then(() => {
    el.style.color = '#4ade80';
    setTimeout(() => el.style.color = '', 1500);
  }).catch(() => {});
};
