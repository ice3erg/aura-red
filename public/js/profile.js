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

    // ── Music status ─────────────────────────────────────
    const lastfmCard   = document.getElementById('lastfmCard');
    const lastfmStatus = document.getElementById('lastfmStatus');
    const lastfmBtn    = document.getElementById('lastfmBtn');
    const spotifyCard   = document.getElementById('spotifyCard');
    const spotifyStatus = document.getElementById('spotifyStatus');
    const spotifyBtn    = document.getElementById('spotifyBtn');
    const musicLinkBtn  = document.getElementById('musicLinkBtn');

    if (user.lastfmConnected && user.lastfmUsername) {
      if (lastfmCard)   lastfmCard.classList.add('connected');
      if (lastfmStatus) { lastfmStatus.textContent = `@${user.lastfmUsername}`; lastfmStatus.classList.add('connected'); }
      if (lastfmBtn)    { lastfmBtn.textContent = 'Настроить'; lastfmBtn.className = 'music-action disconnect'; }
      if (musicLinkBtn) musicLinkBtn.classList.add('connected');
    }
    if (user.spotifyConnected) {
      if (spotifyCard)   spotifyCard.classList.add('connected');
      if (spotifyStatus) { spotifyStatus.textContent = 'Подключено'; spotifyStatus.classList.add('connected'); }
      if (spotifyBtn)    { spotifyBtn.textContent = 'Настроить'; spotifyBtn.className = 'music-action disconnect'; }
      if (musicLinkBtn && !user.lastfmConnected) musicLinkBtn.classList.add('connected');
    }

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

      const updated = await U.updateCurrentUser(payload);
      if (btn) { btn.disabled = false; btn.textContent = 'Сохранить профиль'; }

      if (updated) {
        showNotice('Профиль сохранён!', 'success');
        updateNameDisplay();
        _avatarChanged = false;
        _coverChanged  = false;
      } else {
        showNotice('Ошибка сохранения. Попробуй ещё раз.');
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
