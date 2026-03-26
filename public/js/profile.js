(function () {
  const U = window.AuraUtils;

  // ── Helpers ────────────────────────────────────────────
  function markFilled(input) {
    if (input) {
      const update = () => input.value.trim()
        ? input.classList.add('has-value')
        : input.classList.remove('has-value');
      update();
      input.addEventListener('input', update);
    }
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

  // State
  let _avatarData  = null; // base64 или null (убрать) или undefined (не менялось)
  let _coverData   = null;
  let _avatarChanged = false;
  let _coverChanged  = false;

  async function init() {
    const user = await U.requireAuth();
    if (!user) return;

    // ── Populate fields ─────────────────────────────────
    const fieldName = document.getElementById('fieldName');
    const fieldAge  = document.getElementById('fieldAge');
    const fieldCity = document.getElementById('fieldCity');
    const fieldBio  = document.getElementById('fieldBio');

    if (fieldName) { fieldName.value = user.name || ''; markFilled(fieldName); }
    if (fieldAge)  { fieldAge.value  = user.age  || ''; markFilled(fieldAge); }
    if (fieldCity) { fieldCity.value = user.city || ''; markFilled(fieldCity); }
    if (fieldBio)  { fieldBio.value  = user.bio  || ''; markFilled(fieldBio); }

    // ── Name display ────────────────────────────────────
    function updateNameDisplay() {
      const nd = document.getElementById('nameDisplay');
      const cd = document.getElementById('cityDisplay');
      const ad = document.getElementById('ageDisplay');
      const dot = document.getElementById('ageDot');
      if (nd) nd.textContent = fieldName?.value.trim() || user.name || '—';
      const city = fieldCity?.value.trim() || user.city || '';
      const age  = fieldAge?.value.trim()  || user.age  || '';
      if (cd) cd.textContent = city ? `📍 ${city}` : '';
      if (ad) ad.textContent = age ? `${age} лет` : '';
      if (dot) dot.style.display = (city && age) ? '' : 'none';
    }
    updateNameDisplay();
    [fieldName, fieldAge, fieldCity].forEach(f => f?.addEventListener('input', updateNameDisplay));

    // ── Avatar ──────────────────────────────────────────
    const avatarImg = document.getElementById('avatarImg');
    const avatarPh  = document.getElementById('avatarPh');

    function showAvatar(src) {
      if (avatarImg) { avatarImg.src = src; avatarImg.classList.add('visible'); }
      if (avatarPh)  avatarPh.style.display = 'none';
    }
    function showAvatarPh() {
      if (avatarImg) { avatarImg.src = ''; avatarImg.classList.remove('visible'); }
      if (avatarPh)  avatarPh.style.display = '';
    }

    if (user.avatar) showAvatar(user.avatar);
    else showAvatarPh();

    document.getElementById('avatarInput')?.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { showNotice('Фото до 5 МБ'); return; }
      _avatarData = await fileToBase64(file);
      _avatarChanged = true;
      showAvatar(_avatarData);
    });

    // ── Cover photo ─────────────────────────────────────
    const coverImg = document.getElementById('coverImg');
    const coverPh  = document.getElementById('coverPlaceholder');

    function showCover(src) {
      if (coverImg) { coverImg.src = src; coverImg.classList.add('visible'); }
      if (coverPh)  coverPh.style.display = 'none';
    }
    function showCoverPh() {
      if (coverImg) { coverImg.src = ''; coverImg.classList.remove('visible'); }
      if (coverPh)  coverPh.style.display = '';
    }

    if (user.cover) showCover(user.cover);
    else showCoverPh();

    document.getElementById('coverInput')?.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) { showNotice('Фото до 8 МБ'); return; }
      _coverData = await fileToBase64(file);
      _coverChanged = true;
      showCover(_coverData);
    });

    // ── Photos gallery ────────────────────────────────────
    let _photos = Array.isArray(user.photos) ? [...user.photos] : [];
    let _photosChanged = false;

    function renderPhotos() {
      const grid = document.getElementById('photosGrid');
      if (!grid) return;
      grid.innerHTML = '';
      _photos.forEach((src, i) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;aspect-ratio:1;border-radius:12px;overflow:hidden;background:rgba(255,255,255,0.05);';
        const img = document.createElement('img');
        img.src = src;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
        const del = document.createElement('button');
        del.textContent = '✕';
        del.style.cssText = 'position:absolute;top:5px;right:5px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,0.7);border:none;color:#fff;font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;';
        del.onclick = () => { _photos.splice(i, 1); _photosChanged = true; renderPhotos(); };
        wrap.appendChild(img);
        wrap.appendChild(del);
        grid.appendChild(wrap);
      });
      const addBtn = document.getElementById('addPhotoBtn');
      if (addBtn) addBtn.style.display = _photos.length >= 6 ? 'none' : '';
    }
    renderPhotos();

    document.getElementById('addPhotoBtn')?.addEventListener('click', () => {
      document.getElementById('photoInput')?.click();
    });

    document.getElementById('photoInput')?.addEventListener('change', async e => {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        if (_photos.length >= 6) break;
        if (file.size > 5 * 1024 * 1024) continue;
        const b64 = await fileToBase64(file);
        _photos.push(b64);
        _photosChanged = true;
      }
      e.target.value = '';
      renderPhotos();
    });
    const lastfmCard    = document.getElementById('lastfmCard');
    const lastfmStatus  = document.getElementById('lastfmStatus');
    const lastfmBtn     = document.getElementById('lastfmBtn');
    const lastfmInput   = document.getElementById('lastfmInputWrap');
    const spotifyCard   = document.getElementById('spotifyCard');
    const spotifyStatus = document.getElementById('spotifyStatus');
    const spotifyBtn    = document.getElementById('spotifyBtn');

    // Рисуем состояние Last.fm
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

    // Рисуем состояние Spotify
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

    // Last.fm: подключить (из инпута) или отключить
    lastfmBtn?.addEventListener('click', async () => {
      if (user.lastfmConnected) {
        // Отключить
        lastfmBtn.disabled = true; lastfmBtn.textContent = '...';
        await U.updateCurrentUser({ lastfmConnected: false, lastfmUsername: '' });
        user.lastfmConnected = false; user.lastfmUsername = '';
        renderLastfm(false, '');
        lastfmBtn.disabled = false;
      } else {
        // Показываем инпут — кнопка "Сохранить" в инпуте сделает подключение
        if (lastfmInput) lastfmInput.style.display = '';
        document.getElementById('lastfmUsernameField')?.focus();
      }
    });

    // Last.fm: сохранить username из инпута
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

    // Spotify: подключить (OAuth) или отключить
    spotifyBtn?.addEventListener('click', async () => {
      if (user.spotifyConnected) {
        spotifyBtn.disabled = true; spotifyBtn.textContent = '...';
        await U.updateCurrentUser({ spotifyConnected: false, spotifyAccessToken: '', spotifyRefreshToken: '' });
        user.spotifyConnected = false;
        renderSpotify(false);
        spotifyBtn.disabled = false;
      } else {
        location.href = '/spotify/login';
      }
    });

    // ── Stats ────────────────────────────────────────────
    async function loadStats() {
      try {
        const [sigsR, chatsR] = await Promise.all([
          fetch('/api/signals').then(r => r.json()),
          fetch('/api/chats').then(r => r.json()),
        ]);
        const sigCount   = document.getElementById('statSignals');
        const chatCount  = document.getElementById('statChats');
        const vibeEl     = document.getElementById('statVibe');
        if (sigCount && sigsR.ok)   sigCount.textContent  = (sigsR.signals || []).length;
        if (chatCount && chatsR.ok) chatCount.textContent = (chatsR.chats  || []).length;
        // Определяем вайб по трекам (если подключена музыка)
        if (vibeEl) {
          if (user.lastfmConnected || user.spotifyConnected) vibeEl.textContent = '🔴';
          else vibeEl.textContent = '—';
        }
      } catch {}
    }
    loadStats();

    // ── Track history ─────────────────────────────────────
    function renderTrackHistory() {
      const history = Array.isArray(user.trackHistory) ? user.trackHistory : [];
      const section = document.getElementById('trackHistorySection');
      const list    = document.getElementById('trackHistoryList');
      if (!section || !list || !history.length) return;

      section.style.display = '';
      list.innerHTML = history.slice(0, 5).map(t => {
        const ago = timeAgoShort(t.ts);
        return `<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);">
          ${t.image
            ? `<img src="${t.image}" style="width:38px;height:38px;border-radius:8px;object-fit:cover;flex-shrink:0;" />`
            : `<div style="width:38px;height:38px;border-radius:8px;background:rgba(255,255,255,0.06);flex-shrink:0;display:flex;align-items:center;justify-content:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`
          }
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.track}</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.artist}</div>
          </div>
          <div style="font-size:11px;color:rgba(255,255,255,0.25);flex-shrink:0;">${ago}</div>
        </div>`;
      }).join('');
    }

    function timeAgoShort(ts) {
      const d = Math.floor((Date.now() - ts) / 1000);
      if (d < 60)    return 'только что';
      if (d < 3600)  return Math.floor(d/60) + ' мин';
      if (d < 86400) return Math.floor(d/3600) + ' ч';
      return Math.floor(d/86400) + ' д';
    }

    renderTrackHistory();

    // ── Save ─────────────────────────────────────────────
    document.getElementById('saveBtn')?.addEventListener('click', async () => {
      const name = fieldName?.value.trim() || '';
      const city = fieldCity?.value.trim() || '';
      if (!name) { showNotice('Введи имя'); return; }
      if (!city) { showNotice('Введи город'); return; }

      const btn = document.getElementById('saveBtn');
      if (btn) { btn.disabled = true; btn.textContent = 'Сохраняем...'; }

      const payload = {
        name,
        age:  fieldAge?.value.trim() || '',
        city,
        bio:  fieldBio?.value.trim() || '',
      };
      if (_avatarChanged) payload.avatar = _avatarData;
      if (_coverChanged)  payload.cover  = _coverData;
      if (_photosChanged) payload.photos = _photos;

      const updated = await U.updateCurrentUser(payload);
      if (btn) { btn.disabled = false; btn.textContent = 'Сохранить профиль'; }

      if (updated) {
        showNotice('Профиль сохранён!', 'success');
        updateNameDisplay();
        _avatarChanged = false;
        _coverChanged  = false;
        _photosChanged = false;
      } else {
        showNotice('Ошибка сохранения. Попробуй ещё раз.');
      }
    });

    // ── Share profile ─────────────────────────────────────
    document.getElementById('shareProfileBtn')?.addEventListener('click', () => {
      const name = user.name || '';
      const url = `${location.origin}/u/${encodeURIComponent(name)}`;
      if (navigator.share) {
        navigator.share({ title: `${name} в +aura`, url });
      } else {
        navigator.clipboard?.writeText(url).then(() => {
          showNotice('Ссылка скопирована!', 'success');
        });
      }
    });

    // ── Logout ───────────────────────────────────────────
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      U.go('/login');
    });
  }

  init();
})();
